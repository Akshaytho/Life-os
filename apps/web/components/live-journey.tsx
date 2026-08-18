"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { JourneyDecisionOverview } from "../../../packages/contracts/journey";
import {
  activateJourney,
  getJourneyOverview,
  LifeOsApiError,
} from "../lib/life-os-api";
import { useLifeOsAuth } from "./life-os-auth-provider";
import styles from "./live-journey.module.css";

function dateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function safeMessage(error: unknown): string {
  if (error instanceof LifeOsApiError) {
    if (error.code === "authentication_required") return "Your private session is no longer valid. Sign in again before reading or changing Journey.";
    if (error.code === "journey_unavailable") return "Canonical Journey reads are not enabled in this private API runtime yet.";
    if (error.code === "journey_mutation_unavailable") return "Journey decisions are not enabled in this private API runtime yet.";
    if (error.code === "current_journey_changed") return "Your active Journey changed after this screen loaded. Life OS refused the stale decision; refresh before deciding again.";
    if (error.code === "journey_unchanged") return "That Journey and active capability are already current. Nothing was changed.";
    if (error.code === "explicit_approval_required") return "Life OS refused to activate Journey without the explicit user decision acknowledgement.";
    if (error.code === "idempotency_conflict") return "This retry identity already belongs to a different Journey decision. Refresh before trying again.";
    if (error.code === "idempotency_required") return "Life OS refused the write because safe retry identity was unavailable.";
    if (error.code === "invalid_journey" || error.code === "invalid_request") return "Life OS rejected the Journey input instead of guessing around it.";
    if (error.code === "origin_not_allowed") return "This browser origin is not approved for the private Life OS API.";
    if (error.code === "network_unavailable") return "Life OS lost contact with the private API. The same reviewed decision can be retried safely.";
  }
  return "Life OS could not complete this Journey request. Provider details were kept private.";
}

export function LiveJourney() {
  const { session, signOut } = useLifeOsAuth();
  const [overview, setOverview] = useState<JourneyDecisionOverview>();
  const [name, setName] = useState("");
  const [activeCapability, setActiveCapability] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [reviewSnapshot, setReviewSnapshot] = useState<{
    name: string;
    activeCapability: string;
    expectedCurrentJourneyId: string | null;
  }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const idempotencyAttempt = useRef<{ fingerprint: string; key: string } | undefined>(undefined);

  useEffect(() => {
    if (!session?.access_token) return;
    void loadJourney(session.access_token, true);
  }, [session?.access_token]);

  async function loadJourney(accessToken?: string, initializeDraft = false) {
    const token = accessToken ?? session?.access_token;
    if (!token) return;
    setBusy(true);
    setMessage("Reading canonical Journey through the private RLS boundary…");
    try {
      const next = await getJourneyOverview(token);
      setOverview(next);
      if (initializeDraft) {
        setName(next.current?.name ?? "");
        setActiveCapability(next.current?.activeCapability ?? "");
      }
      setAcknowledged(false);
      setReviewSnapshot(undefined);
      idempotencyAttempt.current = undefined;
      setMessage(next.current
        ? "Active Journey loaded from canonical user decision state."
        : "No active Journey exists. Life OS has not promoted any interest, note, or AI suggestion into one.");
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function changeName(value: string) {
    setName(value);
    setReviewSnapshot(undefined);
    idempotencyAttempt.current = undefined;
  }

  function changeCapability(value: string) {
    setActiveCapability(value);
    setReviewSnapshot(undefined);
    idempotencyAttempt.current = undefined;
  }

  function reviewDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    const nextCapability = activeCapability.trim();
    if (!overview || !acknowledged || !nextName || !nextCapability) return;
    if (nextName.length > 240 || nextCapability.length > 240) return;
    if (overview.current?.name === nextName && overview.current.activeCapability === nextCapability) {
      setMessage("That Journey and active capability are already current. Edit the decision before reviewing it.");
      return;
    }
    setReviewSnapshot({
      name: nextName,
      activeCapability: nextCapability,
      expectedCurrentJourneyId: overview.current?.id ?? null,
    });
    setMessage("Review the exact Journey decision below. Nothing has changed yet.");
  }

  async function commitDecision() {
    if (!session?.access_token || !overview || !reviewSnapshot || !acknowledged) return;
    const currentId = overview.current?.id ?? null;
    if (
      currentId !== reviewSnapshot.expectedCurrentJourneyId
      || name.trim() !== reviewSnapshot.name
      || activeCapability.trim() !== reviewSnapshot.activeCapability
    ) {
      setReviewSnapshot(undefined);
      setMessage("The reviewed Journey decision no longer matches this screen. Review the fields again.");
      return;
    }

    const fingerprint = JSON.stringify(reviewSnapshot);
    const attempt = idempotencyAttempt.current?.fingerprint === fingerprint
      ? idempotencyAttempt.current
      : { fingerprint, key: crypto.randomUUID() };
    idempotencyAttempt.current = attempt;

    setBusy(true);
    setMessage("Sending your explicit Journey decision for server-side authority checks…");
    try {
      const receipt = await activateJourney(session.access_token, {
        name: reviewSnapshot.name,
        activeCapability: reviewSnapshot.activeCapability,
        expectedCurrentJourneyId: reviewSnapshot.expectedCurrentJourneyId,
        approval: { explicit: true, acknowledgement: "ACTIVATE_JOURNEY" },
      }, attempt.key);
      idempotencyAttempt.current = undefined;

      const next = await getJourneyOverview(session.access_token);
      setOverview(next);
      setName(next.current?.name ?? "");
      setActiveCapability(next.current?.activeCapability ?? "");
      setAcknowledged(false);
      setReviewSnapshot(undefined);
      setMessage(receipt.status === "replayed"
        ? "Life OS safely replayed the prior Journey decision. No duplicate decision or domain event was created."
        : "Your Journey decision is now canonical. Any prior active Journey remains preserved in history.");
    } catch (error) {
      if (error instanceof LifeOsApiError && error.code === "current_journey_changed") {
        try {
          const next = await getJourneyOverview(session.access_token);
          setOverview(next);
          setName(next.current?.name ?? "");
          setActiveCapability(next.current?.activeCapability ?? "");
          setAcknowledged(false);
          setReviewSnapshot(undefined);
          idempotencyAttempt.current = undefined;
        } catch {
          // Preserve the original sanitized conflict message.
        }
      }
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.canvas}>
        <header className="system-bar">
          <div className="wordmark">LIFE<span>/</span>OS</div>
          <div className="system-state"><i />PRIVATE · JOURNEY</div>
        </header>

        <section className={styles.hero}>
          <span className="section-kicker">BECOMING · USER DECISION</span>
          <h1>{overview?.current?.name ?? "No active Journey"}</h1>
          <p>{overview?.current
            ? "This is the capability path you explicitly chose. Life OS can collect evidence here later, but it cannot silently replace the decision."
            : "A passing interest is not a Journey. Activate one only when you deliberately choose a capability path worth protecting over time."}</p>
          <div className={styles.heroMeta}>
            <span>{overview?.current ? "ACTIVE · DECISION" : "CANONICAL STATE · EMPTY"}</span>
            <span>{overview?.current ? dateTime(overview.current.decidedAt) : "Nothing inferred"}</span>
          </div>
        </section>

        <section className={styles.sessionRow}>
          <span><i />Authenticated private state · PostgreSQL RLS scoped</span>
          <div>
            <button disabled={busy} onClick={() => void loadJourney()} type="button">Refresh</button>
            <button disabled={busy} onClick={() => void signOut()} type="button">Sign out</button>
          </div>
        </section>

        <section className={styles.currentInstrument} aria-label="Current Journey decision">
          <div className={styles.instrumentTop}><span>NOW</span><span>{overview?.current ? "ACTIVE" : "NOT SET"}</span></div>
          {overview?.current ? (
            <>
              <div className={styles.capabilityLabel}>ACTIVE CAPABILITY</div>
              <h2>{overview.current.activeCapability}</h2>
              <div className={styles.evidenceBoundary}>
                <span>EVIDENCE</span>
                <strong>Not recorded in Journey V1 yet</strong>
                <p>Practice, reels, retained learnings and technique evidence stay absent until their own canonical persistence slice exists.</p>
              </div>
            </>
          ) : (
            <div className={styles.emptyInstrument}>
              <strong>No capability path has been activated.</strong>
              <p>Life OS will not substitute the old prototype, Capture text, or AI output for a user decision.</p>
            </div>
          )}
        </section>

        <section className={styles.editor} aria-label="Journey activation decision">
          <div className={styles.sectionHead}>
            <div><span>DECIDE</span><h2>{overview?.current ? "Change active Journey" : "Activate a Journey"}</h2></div>
            <small>HIGH AUTHORITY</small>
          </div>
          <p>Name the path and the capability that is active now. These are stored as your words, not AI-normalized labels.</p>

          <form onSubmit={reviewDecision}>
            <label>
              Journey name
              <input
                disabled={busy || !overview}
                maxLength={240}
                onChange={(event) => changeName(event.target.value)}
                placeholder="Name the capability journey you are choosing"
                value={name}
              />
              <span>{name.length} / 240</span>
            </label>
            <label>
              Active capability
              <input
                disabled={busy || !overview}
                maxLength={240}
                onChange={(event) => changeCapability(event.target.value)}
                placeholder="What capability is active now?"
                value={activeCapability}
              />
              <span>{activeCapability.length} / 240</span>
            </label>

            <label className={styles.acknowledgement}>
              <input
                checked={acknowledged}
                disabled={busy || !overview}
                onChange={(event) => {
                  setAcknowledged(event.target.checked);
                  setReviewSnapshot(undefined);
                }}
                type="checkbox"
              />
              <span><strong>I am choosing this as my active Journey.</strong> I understand that a previous active Journey will be preserved as superseded history, not deleted.</span>
            </label>

            <button
              className={styles.reviewButton}
              disabled={busy || !overview || !name.trim() || !activeCapability.trim() || !acknowledged}
              type="submit"
            >Review this decision</button>
          </form>

          {reviewSnapshot && (
            <div className={styles.finalReview}>
              <span>FINAL REVIEW · NO CHANGE YET</span>
              <dl>
                <div><dt>Journey</dt><dd>{reviewSnapshot.name}</dd></div>
                <div><dt>Active capability</dt><dd>{reviewSnapshot.activeCapability}</dd></div>
              </dl>
              <p>{reviewSnapshot.expectedCurrentJourneyId
                ? "This will supersede only the Journey version you reviewed. A newer decision will cause the server to refuse this stale write."
                : "This becomes your first active Journey only if no newer Journey decision has appeared."}</p>
              <div className={styles.finalActions}>
                <button disabled={busy} onClick={() => setReviewSnapshot(undefined)} type="button">Edit again</button>
                <button disabled={busy} onClick={() => void commitDecision()} type="button">{busy ? "Checking authority…" : "Activate Journey"}</button>
              </div>
            </div>
          )}

          {message && <p className={styles.message} role="status">{message}</p>}
        </section>

        <section className={styles.history} aria-label="Journey decision history">
          <div className={styles.sectionHead}>
            <div><span>ARC</span><h2>Journey decision history</h2></div>
            <small>{overview?.history.length ?? 0}</small>
          </div>
          {!overview || overview.history.length === 0 ? (
            <div className={styles.historyEmpty}>No superseded or revoked Journey decisions are visible for this user.</div>
          ) : (
            <div className={styles.historyList}>
              {overview.history.map((item) => (
                <article key={item.id}>
                  <div><span>{item.status}</span><time>{dateTime(item.decidedAt)} → {dateTime(item.endedAt)}</time></div>
                  <h3>{item.name}</h3>
                  <p>{item.activeCapability}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className={styles.scopeNote}>
          <span>WHAT THIS SLICE DOES NOT CLAIM</span>
          <p>Journey activation is real now. Practice sessions, evidence maturity, current technique, reels, retained learnings and next experiments are still unavailable until their own persisted trust classes exist.</p>
        </aside>
      </main>
    </div>
  );
}
