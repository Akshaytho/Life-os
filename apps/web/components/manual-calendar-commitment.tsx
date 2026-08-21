"use client";

import { useRef, useState } from "react";
import type {
  CreateManualCalendarCommitmentCommand,
  ManualCalendarCategory,
  ManualCalendarCommitment,
  ManualCalendarCommitmentReceipt,
} from "../../../packages/contracts/manual-calendar";
import { LifeOsApiError } from "../lib/life-os-api";
import { createManualCalendarCommitment } from "../lib/manual-calendar-api";
import styles from "./manual-calendar-commitment.module.css";

const categories: readonly ManualCalendarCategory[] = [
  "Work", "Creator", "Learning", "Health", "Family", "Friends", "Travel", "Personal", "Rest",
];
const commitments: readonly ManualCalendarCommitment[] = ["Fixed", "Important", "Flexible", "Optional"];

type Stage = "CLOSED" | "EDIT" | "REVIEW";

interface Draft {
  title: string;
  startsLocal: string;
  endsLocal: string;
  category: "" | ManualCalendarCategory;
  commitment: "" | ManualCalendarCommitment;
}

const emptyDraft: Draft = { title: "", startsLocal: "", endsLocal: "", category: "", commitment: "" };

interface Attempt { fingerprint: string; key: string; }

function attemptFor(previous: Attempt | undefined, fingerprint: string): Attempt {
  return previous?.fingerprint === fingerprint ? previous : { fingerprint, key: crypto.randomUUID() };
}

function safeMessage(error: unknown): string {
  if (error instanceof LifeOsApiError) {
    if (error.code === "authentication_required") return "Your private session expired before this commitment was saved.";
    if (error.code === "idempotency_conflict") return "This retry identity belongs to different Calendar details. Review the commitment and try again.";
    if (error.code === "explicit_confirmation_required") return "Life OS refused to save this without your final confirmation.";
    if (error.code === "invalid_calendar_commitment" || error.code === "invalid_request") return "Review the title, times, category, and commitment level.";
    if (error.code === "network_unavailable") return "Life OS could not reach the private Calendar write boundary. The same confirmation can be retried safely.";
  }
  return "Life OS could not save this commitment. No Calendar fact was created.";
}

function toIso(value: string): string | undefined {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function displayDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ManualCalendarCommitmentForm({
  accessToken,
  onCommitted,
  initialDraft,
  initialStage = "CLOSED",
}: {
  accessToken: string;
  onCommitted?: (receipt: ManualCalendarCommitmentReceipt) => void | Promise<void>;
  initialDraft?: Partial<Draft>;
  initialStage?: Stage;
}) {
  const [stage, setStage] = useState<Stage>(initialStage);
  const [draft, setDraft] = useState<Draft>({ ...emptyDraft, ...initialDraft });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const attempt = useRef<Attempt | undefined>(undefined);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    attempt.current = undefined;
    setMessage("");
  }

  function normalizedCommand(): CreateManualCalendarCommitmentCommand | undefined {
    const startsAt = toIso(draft.startsLocal);
    const endsAt = toIso(draft.endsLocal);
    if (!draft.title.trim() || !startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt) || !draft.category || !draft.commitment) {
      return undefined;
    }
    return {
      title: draft.title.trim(),
      startsAt,
      endsAt,
      category: draft.category,
      commitment: draft.commitment,
      confirmation: { explicit: true, acknowledgement: "COMMIT_TO_CALENDAR" },
    };
  }

  function review() {
    if (!normalizedCommand()) {
      setMessage("Add a title, valid start/end times, category, and commitment level before review.");
      return;
    }
    setMessage("");
    setStage("REVIEW");
  }

  async function commit() {
    const command = normalizedCommand();
    if (!command) {
      setStage("EDIT");
      setMessage("The draft changed. Review it again before committing.");
      return;
    }
    const fingerprint = JSON.stringify(command);
    const currentAttempt = attemptFor(attempt.current, fingerprint);
    attempt.current = currentAttempt;
    setBusy(true);
    setMessage("Committing this exact time block…");
    try {
      const receipt = await createManualCalendarCommitment(accessToken, command, currentAttempt.key);
      attempt.current = undefined;
      setDraft(emptyDraft);
      setStage("CLOSED");
      setMessage(receipt.status === "replayed" ? "The earlier commitment was safely replayed." : "Committed. It is now a Calendar FACT.");
      await onCommitted?.(receipt);
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (stage === "CLOSED") {
    return (
      <section className={styles.closed} aria-label="Manual Calendar commitment">
        <div><span>MANUAL COMMITMENT</span><strong>Add time without AI.</strong><p>You choose the exact details. Nothing is saved until final review.</p></div>
        <button disabled={busy} onClick={() => setStage("EDIT")} type="button">Add commitment</button>
        {message && <p className={styles.message} role="status">{message}</p>}
      </section>
    );
  }

  if (stage === "REVIEW") {
    const command = normalizedCommand();
    if (!command) {
      return (
        <section className={styles.review} aria-label="Review manual Calendar commitment">
          <p className={styles.message}>The draft is no longer valid.</p>
          <div className={styles.reviewActions}><button onClick={() => setStage("EDIT")} type="button">Return to edit</button></div>
        </section>
      );
    }
    return (
      <section className={styles.review} aria-label="Review manual Calendar commitment">
        <div className={styles.kicker}><span>FINAL REVIEW</span><span>NO WRITE YET</span></div>
        <h2>{command.title}</h2>
        <dl>
          <div><dt>Starts</dt><dd>{displayDateTime(command.startsAt)}</dd></div>
          <div><dt>Ends</dt><dd>{displayDateTime(command.endsAt)}</dd></div>
          <div><dt>Category</dt><dd>{command.category}</dd></div>
          <div><dt>Commitment</dt><dd>{command.commitment}</dd></div>
        </dl>
        <p className={styles.consequence}><strong>This becomes a Calendar FACT.</strong> No AI interpretation or other Life OS domain changes.</p>
        <div className={styles.reviewActions}>
          <button disabled={busy} onClick={() => setStage("EDIT")} type="button">Edit</button>
          <button disabled={busy} onClick={() => void commit()} type="button">{busy ? "Committing…" : "Commit to Calendar"}</button>
        </div>
        {message && <p className={styles.message} role="status">{message}</p>}
      </section>
    );
  }

  return (
    <section className={styles.editor} aria-label="Add manual Calendar commitment">
      <div className={styles.editorHeading}><div><span>MANUAL COMMITMENT</span><strong>What are you committing time to?</strong></div><button disabled={busy} onClick={() => setStage("CLOSED")} type="button">Close</button></div>
      <label className={styles.titleField}>Title<input autoComplete="off" disabled={busy} maxLength={500} onChange={(event) => update("title", event.target.value)} placeholder="e.g. Gym session" value={draft.title} /></label>
      <div className={styles.grid}>
        <label>Starts<input disabled={busy} onChange={(event) => update("startsLocal", event.target.value)} type="datetime-local" value={draft.startsLocal} /></label>
        <label>Ends<input disabled={busy} onChange={(event) => update("endsLocal", event.target.value)} type="datetime-local" value={draft.endsLocal} /></label>
        <label>Category<select disabled={busy} onChange={(event) => update("category", event.target.value as Draft["category"])} value={draft.category}><option value="">Choose</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Commitment<select disabled={busy} onChange={(event) => update("commitment", event.target.value as Draft["commitment"])} value={draft.commitment}><option value="">Choose</option>{commitments.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      <button className={styles.reviewButton} disabled={busy} onClick={review} type="button">Review commitment</button>
      {message && <p className={styles.message} role="status">{message}</p>}
    </section>
  );
}