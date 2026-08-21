"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type {
  DriftExplanation,
  DriftOccurrence,
  DriftReturnPosture,
} from "../../../packages/contracts/drift-return";
import {
  confirmDriftUnderstanding,
  getDriftOverview,
  LifeOsApiError,
  recordDrift,
  recordDriftReturn,
} from "../lib/life-os-api";
import { useLifeOsAuth } from "./life-os-auth-provider";
import styles from "./live-drift.module.css";

const explanationLabels: Record<DriftExplanation, string> = {
  TEMPORARY_INSPIRATION: "Temporary inspiration",
  COMPARISON: "Comparison",
  AVOIDANCE: "Avoidance",
  EMOTIONAL_REACTION: "Emotional reaction",
  GENUINE_RECONSIDERATION: "Genuine reconsideration",
  UNSURE: "Unsure",
};

const returnLabels: Record<DriftReturnPosture, string> = {
  STILL_RETURNING: "I am still returning",
  RETURN_TO_DIRECTION: "Return to my direction",
  PARK_IDEA: "Park the idea separately",
  REFLECT_ONLY: "Keep the reflection only",
  ADJUST_PLAN: "Consider adjusting the plan",
  DELIBERATE_RECONSIDERATION: "Open deliberate reconsideration",
};

const explanations = Object.keys(explanationLabels) as DriftExplanation[];
const returnPostures = Object.keys(returnLabels) as DriftReturnPosture[];

function safeMessage(error: unknown): string {
  if (error instanceof LifeOsApiError) {
    if (error.code === "authentication_required") return "Your private session expired before this Drift action completed.";
    if (error.code === "drift_unavailable" || error.code === "not_found") return "Drift + Return is not enabled in this private runtime yet.";
    if (error.code === "drift_decision_changed") return "This Drift moment changed after the screen loaded. Life OS refused the stale decision.";
    if (error.code === "drift_decision_unchanged") return "That is already the current Drift decision. No duplicate revision was created.";
    if (error.code === "drift_understanding_required") return "Understand the moment before recording a return posture.";
    if (error.code === "drift_already_resolved") return "This Drift moment is already resolved. A recurrence should be recorded as a new moment.";
    if (error.code === "idempotency_conflict") return "This retry identity belongs to a different Drift decision.";
    if (error.code === "network_unavailable") return "Life OS could not reach the private Drift boundary. The same action can be retried safely.";
  }
  return "Life OS could not complete this Drift action. Private details were not exposed.";
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

interface Attempt {
  fingerprint: string;
  key: string;
}

function attemptFor(previous: Attempt | undefined, fingerprint: string): Attempt {
  return previous?.fingerprint === fingerprint ? previous : { fingerprint, key: crypto.randomUUID() };
}

function DriftCard({
  item,
  accessToken,
  busy,
  setBusy,
  reload,
  setMessage,
}: {
  item: DriftOccurrence;
  accessToken?: string;
  busy: boolean;
  setBusy: (value: boolean) => void;
  reload: () => Promise<void>;
  setMessage: (value: string) => void;
}) {
  const current = item.currentDecision;
  const [explanation, setExplanation] = useState<DriftExplanation>(current?.explanation ?? "UNSURE");
  const [triggerNote, setTriggerNote] = useState(current?.triggerNote ?? "");
  const [emotionNote, setEmotionNote] = useState(current?.emotionNote ?? "");
  const [distractionNote, setDistractionNote] = useState(current?.distractionNote ?? "");
  const [understandingReview, setUnderstandingReview] = useState(false);
  const [returnCandidate, setReturnCandidate] = useState<DriftReturnPosture>();
  const understandingAttempt = useRef<Attempt | undefined>(undefined);
  const returnAttempt = useRef<Attempt | undefined>(undefined);

  function updateDraft(action: () => void) {
    action();
    understandingAttempt.current = undefined;
    setUnderstandingReview(false);
  }

  async function commitUnderstanding() {
    if (!accessToken) return;
    const command = {
      explanation,
      expectedCurrentDecisionId: current?.decisionId ?? null,
      ...(triggerNote.trim() ? { triggerNote } : {}),
      ...(emotionNote.trim() ? { emotionNote } : {}),
      ...(distractionNote.trim() ? { distractionNote } : {}),
    };
    const fingerprint = JSON.stringify({ driftId: item.driftId, ...command });
    const attempt = attemptFor(understandingAttempt.current, fingerprint);
    understandingAttempt.current = attempt;
    setBusy(true);
    setMessage("Recording your understanding as a user decision…");
    try {
      const receipt = await confirmDriftUnderstanding(accessToken, item.driftId, command, attempt.key);
      understandingAttempt.current = undefined;
      setUnderstandingReview(false);
      await reload();
      setMessage(receipt.status === "replayed"
        ? "The earlier understanding was safely replayed."
        : "Understanding recorded. No Direction or other Life OS domain changed.");
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function commitReturn() {
    if (!accessToken || !current || !returnCandidate) return;
    const command = {
      returnPosture: returnCandidate,
      expectedCurrentRevision: current.revision,
    };
    const fingerprint = JSON.stringify({ driftId: item.driftId, ...command });
    const attempt = attemptFor(returnAttempt.current, fingerprint);
    returnAttempt.current = attempt;
    setBusy(true);
    setMessage("Recording your reviewed return posture…");
    try {
      const receipt = await recordDriftReturn(accessToken, item.driftId, command, attempt.key);
      returnAttempt.current = undefined;
      setReturnCandidate(undefined);
      await reload();
      setMessage(receipt.status === "replayed"
        ? "The earlier return posture was safely replayed."
        : receipt.lifecycleState === "RESOLVED"
          ? "This Drift moment is resolved. Your other Life OS domains did not change."
          : "Still returning is now current. There is no overdue state and no pressure score.");
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const resolved = item.lifecycleState === "RESOLVED";

  return (
    <article className={styles.item} data-state={item.lifecycleState}>
      <div className={styles.itemTop}>
        <span>{item.lifecycleState.replaceAll("_", " ")}</span>
        <time>{shortDate(item.occurredAt)}</time>
      </div>
      <blockquote>{item.sourceNote ?? "I noticed that I am drifting."}</blockquote>
      <dl>
        <div><dt>Current state</dt><dd>{item.lifecycleState.replaceAll("_", " ")}</dd></div>
        <div><dt>Authority</dt><dd>{current ? "USER DECISION" : "USER SOURCE"}</dd></div>
        <div><dt>Decision revisions</dt><dd>{item.decisionHistory.length}</dd></div>
      </dl>

      {!resolved && (
        <section className={styles.understanding}>
          <div className={styles.sectionTitle}>
            <span>UNDERSTAND THE MOMENT</span>
            <strong>Which explanation is closest right now?</strong>
          </div>
          <div className={styles.choiceGrid}>
            {explanations.map((value) => (
              <button
                aria-pressed={explanation === value}
                disabled={busy}
                key={value}
                onClick={() => updateDraft(() => setExplanation(value))}
                type="button"
              >{explanationLabels[value]}</button>
            ))}
          </div>
          <div className={styles.notes}>
            <label>Trigger <textarea disabled={busy} maxLength={2000} onChange={(event) => updateDraft(() => setTriggerNote(event.target.value))} placeholder="What seemed to start this?" rows={2} value={triggerNote} /></label>
            <label>Emotion <textarea disabled={busy} maxLength={2000} onChange={(event) => updateDraft(() => setEmotionNote(event.target.value))} placeholder="What did you notice feeling?" rows={2} value={emotionNote} /></label>
            <label>Attention moved toward <textarea disabled={busy} maxLength={2000} onChange={(event) => updateDraft(() => setDistractionNote(event.target.value))} placeholder="What pulled your attention?" rows={2} value={distractionNote} /></label>
          </div>
          {!understandingReview
            ? <button className={styles.reviewButton} disabled={busy} onClick={() => setUnderstandingReview(true)} type="button">Review this understanding</button>
            : (
              <aside className={styles.review}>
                <span>FINAL REVIEW · NO WRITE YET</span>
                <h3>{explanationLabels[explanation]}</h3>
                <p>This records your current understanding. It preserves every earlier revision and cannot change Direction, Journey, Calendar, Today, Memory, a goal, a project, or NOT NOW.</p>
                <div><button disabled={busy} onClick={() => setUnderstandingReview(false)} type="button">Keep reviewing</button><button disabled={busy} onClick={() => void commitUnderstanding()} type="button">Record understanding</button></div>
              </aside>
            )}
        </section>
      )}

      {current && !resolved && (
        <section className={styles.returnSection}>
          <div className={styles.sectionTitle}>
            <span>RETURN POSTURE</span>
            <strong>What is the right response now?</strong>
          </div>
          <div className={styles.returnGrid}>
            {returnPostures.map((posture) => (
              <button disabled={busy || current.returnPosture === posture} key={posture} onClick={() => {
                setReturnCandidate(posture);
                returnAttempt.current = undefined;
              }} type="button">{returnLabels[posture]}</button>
            ))}
          </div>
          {returnCandidate && (
            <aside className={styles.returnReview}>
              <span>FINAL REVIEW · NO WRITE YET</span>
              <h3>{returnLabels[returnCandidate]}</h3>
              <p>This records how you chose to respond to this Drift moment. It does not change Direction or any other Life OS domain.</p>
              {returnCandidate === "PARK_IDEA" && <p>Parking the idea still requires a separate explicit Brain Dump / NOT NOW action.</p>}
              {returnCandidate === "DELIBERATE_RECONSIDERATION" && <p>Direction remains unchanged until a separate high-authority Direction review is confirmed.</p>}
              <div><button disabled={busy} onClick={() => setReturnCandidate(undefined)} type="button">Keep reviewing</button><button disabled={busy} onClick={() => void commitReturn()} type="button">Record return posture</button></div>
            </aside>
          )}
        </section>
      )}

      {resolved && (
        <p className={styles.resolved}>
          <span>RESOLVED · {current?.returnPosture ? returnLabels[current.returnPosture] : "return recorded"} · provenance retained</span>
          <Link href="/">See my next action.</Link>
        </p>
      )}
    </article>
  );
}

export function LiveDrift({ visualItems }: { visualItems?: DriftOccurrence[] } = {}) {
  const { session } = useLifeOsAuth();
  const [items, setItems] = useState<DriftOccurrence[]>(visualItems ?? []);
  const [sourceNote, setSourceNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const recordAttempt = useRef<Attempt | undefined>(undefined);

  useEffect(() => {
    if (visualItems) return;
    if (session?.access_token) void load(session.access_token);
  }, [session?.access_token, visualItems]);

  async function load(accessToken = session?.access_token) {
    if (!accessToken) return;
    setBusy(true);
    setMessage("Reading your explicit Drift history…");
    try {
      const overview = await getDriftOverview(accessToken);
      setItems(overview.items);
      setMessage(overview.items.length === 0
        ? "No Drift moments are recorded. Noticing one is enough to begin."
        : "Your Drift history is current. It is context, not a performance score.");
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const accessToken = session?.access_token;
    if (!accessToken) return;
    const command = sourceNote.trim() ? { sourceNote } : {};
    const fingerprint = JSON.stringify(command);
    const attempt = attemptFor(recordAttempt.current, fingerprint);
    recordAttempt.current = attempt;
    setBusy(true);
    setMessage("Recording the moment exactly as you described it…");
    try {
      const receipt = await recordDrift(accessToken, command, attempt.key);
      recordAttempt.current = undefined;
      setSourceNote("");
      await load(accessToken);
      setMessage(receipt.status === "replayed"
        ? "The earlier Drift moment was safely replayed."
        : "You noticed. The moment is recorded; nothing else changed.");
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.canvas}>
      <header className="system-bar">
        <div className="wordmark">LIFE<span>/</span>OS</div>
        <div className="system-state"><i />PRIVATE · DRIFT + RETURN</div>
      </header>

      <section className={styles.hero}>
        <span>RELIABLE RETURN</span>
        <h1>You noticed.<br />That is already a return.</h1>
        <div>
          <p>Drift is not a failure score. Record what is pulling you away, understand it when you can, and choose the next posture yourself.</p>
          <Link href="/">Return to Today</Link>
        </div>
      </section>

      <section className={styles.capture}>
        <div className={styles.sectionTitle}><span>I&apos;M DRIFTING</span><strong>What is pulling you away right now?</strong></div>
        <textarea
          disabled={busy}
          maxLength={4000}
          onChange={(event) => {
            setSourceNote(event.target.value);
            recordAttempt.current = undefined;
          }}
          placeholder="Optional. You can record the moment even when words are not available."
          rows={4}
          value={sourceNote}
        />
        <div><small>USER SOURCE · preserved exactly · no automatic interpretation</small><button disabled={busy} onClick={() => void create()} type="button">Record this moment</button></div>
      </section>

      <section className={styles.boundary}>
        <span>AUTHORITY BOUNDARY</span>
        <strong>You decide what this moment means and how to return. Life OS records; it does not replace your direction.</strong>
      </section>

      <section className={styles.list} aria-label="Drift moments">
        {items.length === 0 && <p className={styles.empty}>No Drift moments recorded.</p>}
        {items.map((item) => (
          <DriftCard
            accessToken={session?.access_token}
            busy={busy}
            item={item}
            key={item.driftId}
            reload={() => load()}
            setBusy={setBusy}
            setMessage={setMessage}
          />
        ))}
      </section>

      {message && <p className={styles.message} role="status">{message}</p>}
    </main>
  );
}