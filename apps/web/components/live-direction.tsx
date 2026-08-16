"use client";

import type { Session } from "@supabase/supabase-js";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { DirectionDecisionOverview } from "../../../packages/contracts/direction";
import {
  getDirectionOverview,
  LifeOsApiError,
  setCurrentDirection,
} from "../lib/life-os-api";
import {
  BrowserAuthConfigurationError,
  getBrowserSupabaseClient,
} from "../lib/supabase-browser";
import liveStyles from "./live-capture-routing.module.css";
import styles from "./live-direction.module.css";

function dateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function safeMessage(error: unknown): string {
  if (error instanceof LifeOsApiError) {
    if (error.code === "authentication_required") return "Your private session is no longer valid. Sign in again before reading or changing Direction.";
    if (error.code === "direction_unavailable") return "Canonical Direction reads are not enabled in this private API runtime yet.";
    if (error.code === "direction_mutation_unavailable") return "Direction decisions are not enabled in this private API runtime yet.";
    if (error.code === "current_direction_changed") return "Your current Direction changed after this screen was loaded. Life OS refused the stale decision; reload before deciding again.";
    if (error.code === "direction_unchanged") return "That wording is already your current Direction. Nothing was changed.";
    if (error.code === "explicit_approval_required") return "Life OS refused to change Direction without the reviewed explicit acknowledgement.";
    if (error.code === "idempotency_conflict") return "This retry key already belongs to a different Direction decision. Reload before trying again.";
    if (error.code === "idempotency_required") return "Life OS refused the write because safe retry identity was unavailable.";
    if (error.code === "invalid_direction" || error.code === "invalid_request") return "Life OS rejected the Direction input instead of guessing around it.";
    if (error.code === "origin_not_allowed") return "This browser origin is not approved for the private Life OS API.";
    if (error.code === "network_unavailable") return "Life OS lost contact with the private API. Your retry identity is preserved so you can safely try the exact same decision again.";
  }
  return "Life OS could not complete this Direction request. Provider details were kept private.";
}

export function LiveDirection() {
  const [session, setSession] = useState<Session | null>(null);
  const [authState, setAuthState] = useState<"checking" | "signed_out" | "signed_in" | "configuration_error">("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  const [overview, setOverview] = useState<DirectionDecisionOverview>();
  const [draft, setDraft] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [reviewSnapshot, setReviewSnapshot] = useState<{ statement: string; expectedCurrentDirectionId: string | null }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const idempotencyAttempt = useRef<{ fingerprint: string; key: string } | undefined>(undefined);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    try {
      const client = getBrowserSupabaseClient();
      void client.auth.getSession().then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setAuthState("signed_out");
          setAuthMessage("Life OS could not restore the browser session.");
          return;
        }
        setSession(data.session);
        setAuthState(data.session ? "signed_in" : "signed_out");
      });

      const listener = client.auth.onAuthStateChange((_event, nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setAuthState(nextSession ? "signed_in" : "signed_out");
        if (!nextSession) {
          setOverview(undefined);
          setDraft("");
          setAcknowledged(false);
          setReviewSnapshot(undefined);
          idempotencyAttempt.current = undefined;
        }
      });
      unsubscribe = () => listener.data.subscription.unsubscribe();
    } catch (error) {
      if (error instanceof BrowserAuthConfigurationError) {
        setAuthState("configuration_error");
        setAuthMessage("Live browser authentication is not configured for this deployment.");
      } else {
        setAuthState("configuration_error");
        setAuthMessage("Live browser authentication could not be initialized.");
      }
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token) return;
    void loadDirection(session.access_token, true);
  }, [session?.access_token]);

  async function currentAccessToken(): Promise<string> {
    const result = await getBrowserSupabaseClient().auth.getSession();
    const token = result.data.session?.access_token;
    if (!token) throw new LifeOsApiError(401, "authentication_required");
    return token;
  }

  async function loadDirection(accessToken?: string, initializeDraft = false) {
    const token = accessToken ?? session?.access_token;
    if (!token) return;

    setBusy(true);
    setMessage("Reading canonical Direction through the private RLS boundary…");
    try {
      const next = await getDirectionOverview(token);
      setOverview(next);
      if (initializeDraft) setDraft(next.current?.statement ?? "");
      setAcknowledged(false);
      setReviewSnapshot(undefined);
      idempotencyAttempt.current = undefined;
      setMessage(next.current
        ? "Current Direction loaded from canonical state."
        : "No current Direction exists yet. Nothing has been inferred or filled in for you.");
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const result = await getBrowserSupabaseClient().auth.signInWithPassword({ email, password });
      setPassword("");
      if (result.error || !result.data.session) {
        setAuthMessage("Sign-in failed. Check the development account credentials and try again.");
        return;
      }
      setSession(result.data.session);
      setAuthState("signed_in");
    } catch {
      setPassword("");
      setAuthMessage("Sign-in could not be completed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    setAuthBusy(true);
    try {
      await getBrowserSupabaseClient().auth.signOut({ scope: "local" });
    } finally {
      setSession(null);
      setAuthState("signed_out");
      setOverview(undefined);
      setDraft("");
      setAuthBusy(false);
    }
  }

  function updateDraft(value: string) {
    setDraft(value);
    setReviewSnapshot(undefined);
    idempotencyAttempt.current = undefined;
  }

  function reviewDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const statement = draft.trim();
    if (!overview || !statement || statement.length > 1200 || !acknowledged) return;
    if (overview.current?.statement === statement) {
      setMessage("That wording is already your current Direction. Edit it before creating a new decision.");
      return;
    }
    setReviewSnapshot({
      statement,
      expectedCurrentDirectionId: overview.current?.id ?? null,
    });
    setMessage("Review the exact wording below. Nothing has changed yet.");
  }

  async function commitDecision() {
    if (!reviewSnapshot || !acknowledged || !overview) return;
    const actualCurrentId = overview.current?.id ?? null;
    if (actualCurrentId !== reviewSnapshot.expectedCurrentDirectionId || draft.trim() !== reviewSnapshot.statement) {
      setReviewSnapshot(undefined);
      setMessage("The reviewed decision no longer matches this screen. Review the current wording again.");
      return;
    }

    const fingerprint = JSON.stringify(reviewSnapshot);
    const attempt = idempotencyAttempt.current?.fingerprint === fingerprint
      ? idempotencyAttempt.current
      : { fingerprint, key: crypto.randomUUID() };
    idempotencyAttempt.current = attempt;

    setBusy(true);
    setMessage("Sending your explicit Direction decision for server-side authority checks…");
    try {
      const token = await currentAccessToken();
      const receipt = await setCurrentDirection(token, {
        statement: reviewSnapshot.statement,
        expectedCurrentDirectionId: reviewSnapshot.expectedCurrentDirectionId,
        approval: {
          explicit: true,
          acknowledgement: "SET_AS_CURRENT_DIRECTION",
        },
      }, attempt.key);

      idempotencyAttempt.current = undefined;
      const next = await getDirectionOverview(token);
      setOverview(next);
      setDraft(next.current?.statement ?? "");
      setAcknowledged(false);
      setReviewSnapshot(undefined);
      setMessage(receipt.status === "replayed"
        ? "Life OS safely replayed the prior decision. No duplicate Direction or event was created."
        : "Your decision is now the canonical current Direction. The prior Direction remains in history.");
    } catch (error) {
      if (error instanceof LifeOsApiError && error.code === "current_direction_changed") {
        try {
          const token = await currentAccessToken();
          const next = await getDirectionOverview(token);
          setOverview(next);
          setDraft(next.current?.statement ?? "");
          setAcknowledged(false);
          setReviewSnapshot(undefined);
          idempotencyAttempt.current = undefined;
        } catch {
          // Keep the original sanitized conflict message if refresh cannot complete.
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
          <div className="system-state"><i />PRIVATE · YOU</div>
        </header>

        <section className={styles.hero}>
          <span className="section-kicker">CURRENT DIRECTION · DECISION</span>
          <h1>Where are you choosing to go?</h1>
          <p>Life OS may help you reflect, but this statement is yours. AI cannot silently set or replace it.</p>
        </section>

        {authState !== "signed_in" && (
          <section className={liveStyles.authPanel} aria-label="Life OS development sign in">
            <div className={liveStyles.authTopline}><span>PRIVATE SESSION</span><span>{authState === "checking" ? "CHECKING" : "SIGNED OUT"}</span></div>
            <h2>Sign in before Life OS can read your Direction.</h2>
            <p>The API verifies the normal Supabase user session again, and PostgreSQL RLS still decides which Direction decisions belong to that user.</p>
            {authState !== "configuration_error" && (
              <form className={liveStyles.authForm} onSubmit={signIn}>
                <label>Email<input autoComplete="username" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
                <label>Password<input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
                <button disabled={authBusy || authState === "checking"} type="submit">{authBusy ? "Signing in…" : "Sign in"}</button>
              </form>
            )}
            {authMessage && <p className={liveStyles.authMessage}>{authMessage}</p>}
          </section>
        )}

        {authState === "signed_in" && session && (
          <>
            <section className={styles.sessionRow}>
              <span><i />Authenticated user · high-authority decisions require explicit approval</span>
              <div><button disabled={busy} onClick={() => void loadDirection()} type="button">Refresh</button><button disabled={authBusy || busy} onClick={signOut} type="button">Sign out</button></div>
            </section>

            <section className={styles.currentCard} aria-label="Current canonical Direction">
              <div className={styles.cardTopline}><span>CURRENT · DECISION</span><span>{overview?.current ? "ACTIVE" : "NOT SET"}</span></div>
              {overview?.current ? (
                <>
                  <blockquote>{overview.current.statement}</blockquote>
                  <p>Chosen {dateTime(overview.current.decidedAt)} · canonical user decision</p>
                </>
              ) : (
                <div className={styles.empty}>No current Direction exists. Life OS will not manufacture one from your notes or AI suggestions.</div>
              )}
            </section>

            <section className={styles.editor} aria-label="Set current Direction">
              <div className={styles.sectionHead}><div><span>YOUR WORDS</span><h2>{overview?.current ? "Change current Direction" : "Set current Direction"}</h2></div><small>HIGH AUTHORITY</small></div>
              <p>Write the exact statement you want stored. Internal wording and line breaks are preserved; the backend does not AI-rewrite the final decision.</p>

              <form onSubmit={reviewDecision}>
                <label className={styles.statementLabel}>
                  Direction statement
                  <textarea
                    disabled={busy || !overview}
                    maxLength={1200}
                    onChange={(event) => updateDraft(event.target.value)}
                    placeholder="Write the direction you are deliberately choosing…"
                    rows={7}
                    value={draft}
                  />
                  <span>{draft.length} / 1200</span>
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
                  <span><strong>I am choosing this as my current Direction.</strong> I understand it will supersede my current decision, if one exists, while keeping that prior decision in history.</span>
                </label>

                <button className={styles.reviewButton} disabled={busy || !overview || !draft.trim() || !acknowledged} type="submit">Review this decision</button>
              </form>

              {reviewSnapshot && (
                <div className={styles.finalReview}>
                  <span>FINAL REVIEW · NO CHANGE YET</span>
                  <blockquote>{reviewSnapshot.statement}</blockquote>
                  <p>{reviewSnapshot.expectedCurrentDirectionId
                    ? "This will supersede the current Direction only if it is still the version you reviewed."
                    : "This will become your first current Direction only if no newer Direction has appeared."}</p>
                  <div className={styles.finalActions}>
                    <button disabled={busy} onClick={() => setReviewSnapshot(undefined)} type="button">Edit again</button>
                    <button disabled={busy} onClick={() => void commitDecision()} type="button">{busy ? "Checking authority…" : "Set as current Direction"}</button>
                  </div>
                </div>
              )}

              {message && <p className={styles.message} role="status">{message}</p>}
            </section>

            <section className={styles.history} aria-label="Direction decision history">
              <div className={styles.sectionHead}><div><span>HISTORY</span><h2>Previous decisions</h2></div><small>{overview?.history.length ?? 0}</small></div>
              {!overview || overview.history.length === 0 ? (
                <div className={styles.empty}>No superseded or revoked Direction decisions are visible for this user.</div>
              ) : (
                <div className={styles.historyList}>
                  {overview.history.map((item) => (
                    <article key={item.id}>
                      <div><span>{item.status}</span><time>{dateTime(item.decidedAt)} → {dateTime(item.endedAt)}</time></div>
                      <p>{item.statement}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
