"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type {
  DailyReturnOverview,
  DailyReturnState,
  SubmitDailyReturnReviewCommand,
} from "../../../packages/contracts/daily-return";
import {
  appendDailyLogEntry,
  getDailyReturnOverview,
  LifeOsApiError,
  submitDailyReturnReview,
} from "../lib/life-os-api";
import styles from "./live-daily-return.module.css";

interface LiveDailyReturnProps {
  accessToken: string;
  localDate: string;
  timeZone: string;
}

interface ReviewDraft {
  whatHappened: string;
  whatMovedForward: string;
  whatPulledMeAway: string;
  returnToTomorrow: string;
  returnState: DailyReturnState | "";
}

const emptyDraft: ReviewDraft = {
  whatHappened: "",
  whatMovedForward: "",
  whatPulledMeAway: "",
  returnToTomorrow: "",
  returnState: "",
};

function safeMessage(error: unknown): string {
  if (error instanceof LifeOsApiError) {
    if (error.code === "authentication_required") return "Your session expired before this reflection could be recorded.";
    if (error.code === "daily_return_unavailable") return "Daily Return is not enabled in this private runtime.";
    if (error.code === "daily_return_mutation_unavailable") return "Daily Return writes are not enabled in this private runtime.";
    if (error.code === "current_review_changed") return "This day's review changed after the screen loaded. Life OS refused the stale revision.";
    if (error.code === "review_unchanged") return "That reflection is already the current review. Nothing changed.";
    if (error.code === "idempotency_conflict") return "This retry identity already belongs to different reflection content.";
    if (error.code === "idempotency_required") return "Life OS refused the write because safe retry identity was unavailable.";
    if (error.code === "invalid_date" || error.code === "invalid_daily_return" || error.code === "invalid_request") {
      return "Life OS rejected the reflection input instead of guessing around it.";
    }
    if (error.code === "network_unavailable") return "Life OS lost contact with the private Daily Return boundary. The same reflection can be retried safely.";
  }
  return "Life OS could not complete the Daily Return request. Private details were not exposed.";
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function draftFromOverview(overview: DailyReturnOverview): ReviewDraft {
  const current = overview.currentReview;
  if (!current) return emptyDraft;
  return {
    whatHappened: current.whatHappened,
    whatMovedForward: current.whatMovedForward,
    whatPulledMeAway: current.whatPulledMeAway,
    returnToTomorrow: current.returnToTomorrow,
    returnState: current.returnState,
  };
}

export function LiveDailyReturn({
  accessToken,
  localDate,
  timeZone,
}: LiveDailyReturnProps) {
  const [overview, setOverview] = useState<DailyReturnOverview>();
  const [logBody, setLogBody] = useState("");
  const [draft, setDraft] = useState<ReviewDraft>(emptyDraft);
  const [reviewSnapshot, setReviewSnapshot] = useState<SubmitDailyReturnReviewCommand>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const logAttempt = useRef<{ fingerprint: string; key: string } | undefined>(undefined);
  const reviewAttempt = useRef<{ fingerprint: string; key: string } | undefined>(undefined);

  useEffect(() => {
    void load(true);
  }, [accessToken, localDate]);

  async function load(initializeDraft: boolean) {
    setBusy(true);
    setMessage("Reading today's exact reflections…");
    try {
      const next = await getDailyReturnOverview(accessToken, localDate);
      setOverview(next);
      if (initializeDraft) setDraft(draftFromOverview(next));
      setMessage(
        next.logEntries.length === 0 && !next.currentReview
          ? "Nothing has been recorded for this day yet."
          : "Today's reflections loaded from canonical private state.",
      );
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function updateDraft<K extends keyof ReviewDraft>(key: K, value: ReviewDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setReviewSnapshot(undefined);
    reviewAttempt.current = undefined;
  }

  async function appendLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = logBody.trim();
    if (!body) return;
    const command = { localDate, timeZone, body };
    const fingerprint = JSON.stringify(command);
    const attempt = logAttempt.current?.fingerprint === fingerprint
      ? logAttempt.current
      : { fingerprint, key: crypto.randomUUID() };
    logAttempt.current = attempt;

    setBusy(true);
    setMessage("Recording your exact reflection…");
    try {
      const receipt = await appendDailyLogEntry(
        accessToken,
        command,
        attempt.key,
      );
      logAttempt.current = undefined;
      setLogBody("");
      await load(false);
      setMessage(
        receipt.status === "replayed"
          ? "The earlier Daily Log write was safely replayed. No duplicate was created."
          : "Reflection recorded. It has not changed any other Life OS domain.",
      );
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !draft.whatHappened.trim()
      || !draft.whatMovedForward.trim()
      || !draft.whatPulledMeAway.trim()
      || !draft.returnToTomorrow.trim()
      || !draft.returnState
    ) {
      return;
    }
    setReviewSnapshot({
      localDate,
      timeZone,
      whatHappened: draft.whatHappened.trim(),
      whatMovedForward: draft.whatMovedForward.trim(),
      whatPulledMeAway: draft.whatPulledMeAway.trim(),
      returnToTomorrow: draft.returnToTomorrow.trim(),
      returnState: draft.returnState,
      expectedCurrentReviewId: overview?.currentReview?.id ?? null,
    });
    setMessage("Review the exact reflection below. Nothing has changed yet.");
  }

  async function commitReview() {
    if (!reviewSnapshot) return;
    const fingerprint = JSON.stringify(reviewSnapshot);
    const attempt = reviewAttempt.current?.fingerprint === fingerprint
      ? reviewAttempt.current
      : { fingerprint, key: crypto.randomUUID() };
    reviewAttempt.current = attempt;

    setBusy(true);
    setMessage("Recording the reviewed end-of-day reflection…");
    try {
      const receipt = await submitDailyReturnReview(
        accessToken,
        reviewSnapshot,
        attempt.key,
      );
      reviewAttempt.current = undefined;
      setReviewSnapshot(undefined);
      await load(true);
      setMessage(
        receipt.status === "replayed"
          ? "The earlier review write was safely replayed. No duplicate revision was created."
          : receipt.supersededReviewId
            ? "The revised review is current. The earlier reflection remains preserved in history."
            : "The end-of-day reflection is now recorded without a score.",
      );
    } catch (error) {
      if (error instanceof LifeOsApiError && error.code === "current_review_changed") {
        await load(true);
        setReviewSnapshot(undefined);
        reviewAttempt.current = undefined;
      }
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.surface} aria-label="Daily Log and end-of-day return review">
      <header className={styles.heading}>
        <div>
          <span>REFLECTION / DAILY RETURN</span>
          <h2>Remember the day. Choose the return.</h2>
        </div>
        <p>No score. No percentage. These words stay reflection and do not silently change Direction, Journey, Calendar, or Memory.</p>
      </header>

      <div className={styles.logGrid}>
        <div className={styles.logHistory}>
          <div className={styles.blockTop}>
            <span>DAILY LOG</span>
            <strong>{overview?.logEntries.length ?? 0}</strong>
          </div>
          {overview && overview.logEntries.length === 0 && (
            <p className={styles.empty}>No Daily Log reflections yet.</p>
          )}
          {overview?.logEntries.map((entry) => (
            <article className={styles.logEntry} key={entry.id}>
              <div><span>REFLECTION</span><time>{timeLabel(entry.occurredAt)}</time></div>
              <p>{entry.body}</p>
            </article>
          ))}
        </div>

        <form className={styles.quickLog} onSubmit={appendLog}>
          <label htmlFor="daily-log-body">What is worth remembering right now?</label>
          <textarea
            id="daily-log-body"
            disabled={busy}
            maxLength={4000}
            onChange={(event) => {
              setLogBody(event.target.value);
              logAttempt.current = undefined;
            }}
            placeholder="Record what happened in your own words."
            rows={6}
            value={logBody}
          />
          <div><span>{logBody.length} / 4000 · REFLECTION</span><button disabled={busy || !logBody.trim()} type="submit">Record reflection</button></div>
        </form>
      </div>

      <form className={styles.reviewForm} onSubmit={review}>
        <div className={styles.reviewTop}>
          <div><span>END OF DAY</span><h3>{overview?.currentReview ? "Revise today's return review" : "Close the loop without judging the day"}</h3></div>
          <small>{overview?.currentReview ? "CURRENT REFLECTION EXISTS" : "NOT RECORDED"}</small>
        </div>

        <div className={styles.promptGrid}>
          <label>What happened today?<textarea disabled={busy} maxLength={4000} onChange={(event) => updateDraft("whatHappened", event.target.value)} rows={5} value={draft.whatHappened} /></label>
          <label>What moved forward?<textarea disabled={busy} maxLength={4000} onChange={(event) => updateDraft("whatMovedForward", event.target.value)} rows={5} value={draft.whatMovedForward} /></label>
          <label>What pulled me away?<textarea disabled={busy} maxLength={4000} onChange={(event) => updateDraft("whatPulledMeAway", event.target.value)} rows={5} value={draft.whatPulledMeAway} /></label>
          <label>What do I return to tomorrow?<textarea disabled={busy} maxLength={4000} onChange={(event) => updateDraft("returnToTomorrow", event.target.value)} rows={5} value={draft.returnToTomorrow} /></label>
        </div>

        <fieldset className={styles.returnChoice}>
          <legend>Did I return to my direction after drifting?</legend>
          {([
            ["RETURNED", "I returned"],
            ["STILL_RETURNING", "I am still returning"],
            ["NO_DRIFT_NOTICED", "I did not notice drift"],
          ] as const).map(([value, label]) => (
            <label key={value}><input checked={draft.returnState === value} disabled={busy} name="return-state" onChange={() => updateDraft("returnState", value)} type="radio" value={value} /><span>{label}</span></label>
          ))}
        </fieldset>

        <button
          className={styles.reviewButton}
          disabled={
            busy
            || !draft.whatHappened.trim()
            || !draft.whatMovedForward.trim()
            || !draft.whatPulledMeAway.trim()
            || !draft.returnToTomorrow.trim()
            || !draft.returnState
          }
          type="submit"
        >Review reflection</button>
      </form>

      {reviewSnapshot && (
        <aside className={styles.finalReview}>
          <span>FINAL REVIEW · NO WRITE YET</span>
          <dl>
            <div><dt>What happened</dt><dd>{reviewSnapshot.whatHappened}</dd></div>
            <div><dt>What moved</dt><dd>{reviewSnapshot.whatMovedForward}</dd></div>
            <div><dt>What pulled away</dt><dd>{reviewSnapshot.whatPulledMeAway}</dd></div>
            <div><dt>Return tomorrow</dt><dd>{reviewSnapshot.returnToTomorrow}</dd></div>
            <div><dt>Return state</dt><dd>{reviewSnapshot.returnState.replaceAll("_", " ").toLowerCase()}</dd></div>
          </dl>
          <p>{reviewSnapshot.expectedCurrentReviewId
            ? "Submitting creates a new current revision and preserves the earlier review."
            : "Submitting records the first review for this local date."}</p>
          <div><button disabled={busy} onClick={() => setReviewSnapshot(undefined)} type="button">Edit again</button><button disabled={busy} onClick={() => void commitReview()} type="button">{busy ? "Recording…" : "Record reviewed reflection"}</button></div>
        </aside>
      )}

      {message && <p className={styles.message} role="status">{message}</p>}

      {overview && overview.reviewHistory.length > 0 && (
        <p className={styles.historyNote}>{overview.reviewHistory.length} earlier {overview.reviewHistory.length === 1 ? "revision is" : "revisions are"} preserved for this day.</p>
      )}
    </section>
  );
}
