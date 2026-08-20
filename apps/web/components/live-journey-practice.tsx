"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  soundDesignTechniqueCodes,
  type JourneyPracticeOverview,
  type SoundDesignTechniqueCode,
} from "../../../packages/contracts/journey-practice";
import {
  activateJourney,
  completeJourneyPractice,
  getJourneyPracticeOverview,
  LifeOsApiError,
  startJourneyPractice,
} from "../lib/life-os-api";
import { useLifeOsAuth } from "./life-os-auth-provider";
import styles from "./live-journey-practice.module.css";

const techniqueLabels: Record<SoundDesignTechniqueCode, string> = {
  ENVIRONMENTAL_SOUND: "Environmental sound",
  J_L_CUTS: "J/L cuts",
  DIALOGUE_CLARITY: "Dialogue clarity",
  MUSIC_RELATIONSHIP: "Music relationship",
  SILENCE: "Silence",
  SOUND_EFFECTS: "Sound effects",
  LAYERING: "Layering",
};

interface Attempt {
  fingerprint: string;
  key: string;
}

function attemptFor(previous: Attempt | undefined, fingerprint: string): Attempt {
  return previous?.fingerprint === fingerprint
    ? previous
    : { fingerprint, key: crypto.randomUUID() };
}

function safeMessage(error: unknown): string {
  if (error instanceof LifeOsApiError) {
    if (error.code === "authentication_required") return "Your private session expired before this Journey action completed.";
    if (error.code === "journey_unavailable" || error.code === "not_found") return "Journey Activation + Practice is not enabled in this private runtime yet.";
    if (error.code === "journey_already_activated") return "A Journey capability is already active. Life OS did not replace it.";
    if (error.code === "journey_activation_required") return "Choose the current Journey capability before starting practice.";
    if (error.code === "open_practice_session_exists") return "One practice session is already open. Return to it instead of creating a duplicate.";
    if (error.code === "practice_session_already_completed") return "That practice session is already complete.";
    if (error.code === "idempotency_conflict") return "This retry identity belongs to a different Journey action.";
    if (error.code === "network_unavailable") return "Life OS could not reach the private Journey boundary. The same action can be retried safely.";
  }
  return "Life OS could not complete this Journey action. Private details were not exposed.";
}

function formattedDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formattedDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return `${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}h ${remainder}m` : `${minutes}m`;
}

const emptyOverview: JourneyPracticeOverview = {
  activation: null,
  openSession: null,
  completedSessions: [],
  practiceCounts: {},
};

export function LiveJourneyPractice({
  visualOverview,
}: {
  visualOverview?: JourneyPracticeOverview;
} = {}) {
  const { session } = useLifeOsAuth();
  const [overview, setOverview] = useState(visualOverview ?? emptyOverview);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [startingTechnique, setStartingTechnique] = useState<SoundDesignTechniqueCode>("ENVIRONMENTAL_SOUND");
  const [decisionReason, setDecisionReason] = useState("");
  const [activationReview, setActivationReview] = useState(false);
  const [practiceTechnique, setPracticeTechnique] = useState<SoundDesignTechniqueCode>("ENVIRONMENTAL_SOUND");
  const [experimentIntention, setExperimentIntention] = useState("");
  const [reflectionNote, setReflectionNote] = useState("");
  const [retainedLearningCandidate, setRetainedLearningCandidate] = useState("");
  const [completionReview, setCompletionReview] = useState(false);
  const activationAttempt = useRef<Attempt | undefined>(undefined);
  const startAttempt = useRef<Attempt | undefined>(undefined);
  const completionAttempt = useRef<Attempt | undefined>(undefined);

  useEffect(() => {
    if (visualOverview) return;
    if (session?.access_token) void load(session.access_token);
  }, [session?.access_token, visualOverview]);

  useEffect(() => {
    if (overview.activation) {
      setPracticeTechnique(overview.activation.startingTechnique);
    }
  }, [overview.activation]);

  async function load(accessToken = session?.access_token) {
    if (!accessToken) return;
    setBusy(true);
    setMessage("Reading your canonical Journey evidence…");
    try {
      const value = await getJourneyPracticeOverview(accessToken);
      setOverview(value);
      setMessage(value.activation
        ? "Journey is current. Practice is shown as chronology, not a score."
        : "No Journey is active. Life OS will wait for your explicit decision.");
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function commitActivation() {
    const accessToken = session?.access_token;
    if (!accessToken) return;
    const command = {
      journeyCode: "TRAVEL_CREATOR" as const,
      capabilityCode: "SOUND_DESIGN" as const,
      startingTechnique,
      ...(decisionReason.trim() ? { decisionReason } : {}),
    };
    const fingerprint = JSON.stringify(command);
    const attempt = attemptFor(activationAttempt.current, fingerprint);
    activationAttempt.current = attempt;
    setBusy(true);
    setMessage("Recording your explicit capability decision…");
    try {
      const receipt = await activateJourney(accessToken, command, attempt.key);
      activationAttempt.current = undefined;
      setActivationReview(false);
      await load(accessToken);
      setMessage(receipt.status === "replayed"
        ? "The earlier activation was safely replayed."
        : "Travel Creator → Sound Design is active. Nothing was scheduled and no future phase changed.");
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function startPractice() {
    const accessToken = session?.access_token;
    if (!accessToken) return;
    const command = {
      technique: practiceTechnique,
      ...(experimentIntention.trim() ? { experimentIntention } : {}),
    };
    const fingerprint = JSON.stringify(command);
    const attempt = attemptFor(startAttempt.current, fingerprint);
    startAttempt.current = attempt;
    setBusy(true);
    setMessage("Starting one factual practice session…");
    try {
      const receipt = await startJourneyPractice(accessToken, command, attempt.key);
      startAttempt.current = undefined;
      setExperimentIntention("");
      await load(accessToken);
      setMessage(receipt.status === "replayed"
        ? "The earlier practice start was safely replayed."
        : "Practice started. It created evidence only—no Calendar event or task.");
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function completePractice() {
    const accessToken = session?.access_token;
    const open = overview.openSession;
    if (!accessToken || !open) return;
    const command = {
      ...(reflectionNote.trim() ? { reflectionNote } : {}),
      ...(retainedLearningCandidate.trim() ? { retainedLearningCandidate } : {}),
    };
    const fingerprint = JSON.stringify({ sessionId: open.sessionId, ...command });
    const attempt = attemptFor(completionAttempt.current, fingerprint);
    completionAttempt.current = attempt;
    setBusy(true);
    setMessage("Completing practice and preserving your reflection separately…");
    try {
      const receipt = await completeJourneyPractice(
        accessToken,
        open.sessionId,
        command,
        attempt.key,
      );
      completionAttempt.current = undefined;
      setCompletionReview(false);
      setReflectionNote("");
      setRetainedLearningCandidate("");
      await load(accessToken);
      setMessage(receipt.status === "replayed"
        ? "The earlier completion was safely replayed."
        : "Practice completed as fact. Your learning remains a reflection candidate, not automatic Memory.");
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const activation = overview.activation;
  const open = overview.openSession;

  return (
    <main className={styles.canvas}>
      <header className="system-bar">
        <div className="wordmark">LIFE<span>/</span>OS</div>
        <div className="system-state"><i />PRIVATE · JOURNEY</div>
      </header>

      <section className={styles.hero}>
        <span>DELIBERATE CAPABILITY</span>
        <h1>{activation ? <>Sound is the<br />work now.</> : <>Choose deliberately.<br />Then practise for evidence.</>}</h1>
        <div>
          <p>Journey records what you chose to become capable of and the practice that actually happened. It never turns effort into a streak or mastery percentage.</p>
          <Link href="/">Return to Today</Link>
        </div>
      </section>

      {!activation && (
        <section className={styles.activation}>
          <div className={styles.sectionTitle}>
            <span>ACTIVATE / EXPLICIT DECISION</span>
            <strong>Travel Creator → Sound Design</strong>
            <p>The first route is available, not assumed. Future phases remain orientation only.</p>
          </div>
          <div className={styles.techniqueGrid}>
            {soundDesignTechniqueCodes.map((technique) => (
              <button
                aria-pressed={startingTechnique === technique}
                disabled={busy}
                key={technique}
                onClick={() => {
                  setStartingTechnique(technique);
                  setActivationReview(false);
                  activationAttempt.current = undefined;
                }}
                type="button"
              >{techniqueLabels[technique]}</button>
            ))}
          </div>
          <label>Why this capability now? <span>optional · user source</span>
            <textarea
              disabled={busy}
              maxLength={2000}
              onChange={(event) => {
                setDecisionReason(event.target.value);
                setActivationReview(false);
                activationAttempt.current = undefined;
              }}
              placeholder="Your reason is preserved exactly."
              rows={3}
              value={decisionReason}
            />
          </label>
          {!activationReview
            ? <button className={styles.primary} disabled={busy} onClick={() => setActivationReview(true)} type="button">Review activation</button>
            : (
              <aside className={styles.review}>
                <span>FINAL REVIEW · NO WRITE YET</span>
                <h2>Travel Creator<br />Sound Design</h2>
                <p>Starting technique: <strong>{techniqueLabels[startingTechnique]}</strong></p>
                <p>This chooses the current capability. It does not schedule practice, activate future phases, change Direction, or create a goal.</p>
                <div><button disabled={busy} onClick={() => setActivationReview(false)} type="button">Keep reviewing</button><button disabled={busy} onClick={() => void commitActivation()} type="button">Activate Sound Design</button></div>
              </aside>
            )}
        </section>
      )}

      {activation && (
        <>
          <section className={styles.instrument}>
            <div><span>CURRENT JOURNEY</span><strong>Travel Creator</strong></div>
            <div><span>ACTIVE CAPABILITY</span><strong>Sound Design</strong></div>
            <div><span>STARTING TECHNIQUE</span><strong>{techniqueLabels[activation.startingTechnique]}</strong></div>
            <p>DECISION · {formattedDate(activation.decidedAt)} · future phases remain quiet</p>
          </section>

          {open ? (
            <section className={styles.openSession}>
              <div className={styles.sessionTop}><span>ACTIVE PRACTICE</span><time>{formattedDate(open.startedAt)}</time></div>
              <h2>{techniqueLabels[open.technique]}</h2>
              <blockquote>{open.experimentIntention ?? "Practice started without a written experiment intention."}</blockquote>
              <p className={styles.authority}>FACT · open and resumable · never overdue</p>
              <div className={styles.completionFields}>
                <label>What did you notice? <span>optional reflection</span><textarea disabled={busy} maxLength={4000} onChange={(event) => {
                  setReflectionNote(event.target.value);
                  setCompletionReview(false);
                  completionAttempt.current = undefined;
                }} rows={3} value={reflectionNote} /></label>
                <label>What may be worth retaining? <span>optional candidate</span><textarea disabled={busy} maxLength={4000} onChange={(event) => {
                  setRetainedLearningCandidate(event.target.value);
                  setCompletionReview(false);
                  completionAttempt.current = undefined;
                }} rows={3} value={retainedLearningCandidate} /></label>
              </div>
              {!completionReview
                ? <button className={styles.primary} disabled={busy} onClick={() => setCompletionReview(true)} type="button">Review completion</button>
                : (
                  <aside className={styles.review}>
                    <span>FINAL REVIEW · NO WRITE YET</span>
                    <h2>Complete this practice.</h2>
                    <p>The session becomes factual Journey evidence. Reflection remains reflection and is not silently promoted to Memory.</p>
                    <div><button disabled={busy} onClick={() => setCompletionReview(false)} type="button">Keep practising</button><button disabled={busy} onClick={() => void completePractice()} type="button">Complete practice</button></div>
                  </aside>
                )}
            </section>
          ) : (
            <section className={styles.start}>
              <div className={styles.sectionTitle}><span>NEXT / ONE EXPERIMENT</span><strong>Start practice when the work begins.</strong><p>No Calendar item or Today task will be created.</p></div>
              <div className={styles.techniqueGrid}>
                {soundDesignTechniqueCodes.map((technique) => (
                  <button aria-pressed={practiceTechnique === technique} disabled={busy} key={technique} onClick={() => {
                    setPracticeTechnique(technique);
                    startAttempt.current = undefined;
                  }} type="button">{techniqueLabels[technique]}</button>
                ))}
              </div>
              <label>Experiment intention <span>optional · preserved exactly</span><textarea disabled={busy} maxLength={4000} onChange={(event) => {
                setExperimentIntention(event.target.value);
                startAttempt.current = undefined;
              }} placeholder="One concrete thing to try." rows={3} value={experimentIntention} /></label>
              <button className={styles.primary} disabled={busy} onClick={() => void startPractice()} type="button">Start practice</button>
            </section>
          )}

          <section className={styles.evidence}>
            <div className={styles.sectionTitle}><span>PRACTICE CHRONOLOGY</span><strong>Evidence, not streaks.</strong><p>Only completed sessions count. Raw reflections remain attached to their source session.</p></div>
            <div className={styles.counts}>
              {soundDesignTechniqueCodes.map((technique) => (
                <div key={technique}><strong>{overview.practiceCounts[technique] ?? 0}</strong><span>{techniqueLabels[technique]}</span></div>
              ))}
            </div>
            <div className={styles.chronology}>
              {overview.completedSessions.length === 0 && <p>No completed practice sessions yet.</p>}
              {overview.completedSessions.map((item, index) => (
                <article key={item.sessionId}>
                  <div className={styles.sessionTop}><span>P/{String(overview.completedSessions.length - index).padStart(2, "0")} · COMPLETED</span><time>{formattedDate(item.completion!.completedAt)}</time></div>
                  <h3>{techniqueLabels[item.technique]}</h3>
                  <p>{item.experimentIntention ?? "No experiment intention was written."}</p>
                  <dl>
                    <div><dt>Duration</dt><dd>{formattedDuration(item.completion!.durationSeconds)}</dd></div>
                    <div><dt>Evidence</dt><dd>FACT</dd></div>
                    <div><dt>Reflection</dt><dd>REFLECTION</dd></div>
                  </dl>
                  {item.completion!.reflectionNote && <blockquote>{item.completion!.reflectionNote}</blockquote>}
                  {item.completion!.retainedLearningCandidate && <aside><span>RETAINED-LEARNING CANDIDATE · NOT MEMORY</span><p>{item.completion!.retainedLearningCandidate}</p></aside>}
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {message && <p className={styles.message} role="status">{message}</p>}
    </main>
  );
}
