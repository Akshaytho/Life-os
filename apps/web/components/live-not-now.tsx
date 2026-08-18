"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { NotNowItem, NotNowState } from "../../../packages/contracts/brain-dump-not-now";
import {
  getNotNowOverview,
  LifeOsApiError,
  reviewNotNowItem,
} from "../lib/life-os-api";
import { useLifeOsAuth } from "./life-os-auth-provider";
import styles from "./live-not-now.module.css";

const stateLabels: Record<NotNowState, string> = {
  PARKED_NOT_NOW: "Parked",
  RESEARCHING: "Researching without commitment",
  DELAYED: "Decision delayed",
  DISMISSED: "Dismissed",
  RELEASED_FOR_REVIEW: "Released for deliberate review",
};

const assessmentLabels = {
  TEMPORARY_INSPIRATION: "Temporary inspiration",
  WORTH_RESEARCHING: "Worth researching",
  GENUINE_DIRECTION_CHANGE: "Genuine change in direction",
  EMOTIONAL_REACTION: "Emotional reaction",
  UNSURE: "Unsure",
} as const;

const actionLabels: Array<[NotNowState, string]> = [
  ["PARKED_NOT_NOW", "Keep parked"],
  ["RESEARCHING", "Research without committing"],
  ["DELAYED", "Delay the decision"],
  ["DISMISSED", "Dismiss"],
  ["RELEASED_FOR_REVIEW", "Release for review"],
];

interface PendingReview {
  item: NotNowItem;
  targetState: NotNowState;
  reviewNote: string;
}

function safeMessage(error: unknown): string {
  if (error instanceof LifeOsApiError) {
    if (error.code === "authentication_required") return "Your session expired before NOT NOW could be read.";
    if (error.code === "brain_dump_not_now_unavailable" || error.code === "not_found") return "NOT NOW is not enabled in this private runtime yet.";
    if (error.code === "not_now_item_changed") return "This item changed after the screen loaded. Life OS refused the stale review.";
    if (error.code === "not_now_transition_not_allowed") return "That item has reached a final V1 state and cannot be changed again here.";
    if (error.code === "idempotency_conflict") return "This retry identity belongs to a different review decision.";
    if (error.code === "network_unavailable") return "Life OS could not reach the private NOT NOW boundary. The same review can be retried safely.";
  }
  return "Life OS could not complete this NOT NOW review. Private details were not exposed.";
}

function isTerminal(state: NotNowState): boolean {
  return state === "DISMISSED" || state === "RELEASED_FOR_REVIEW";
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export function LiveNotNow({ visualItems }: { visualItems?: NotNowItem[] } = {}) {
  const { session } = useLifeOsAuth();
  const [items, setItems] = useState<NotNowItem[]>(visualItems ?? []);
  const [pending, setPending] = useState<PendingReview>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const reviewAttempt = useRef<{ fingerprint: string; key: string } | undefined>(undefined);

  useEffect(() => {
    if (visualItems) return;
    if (session?.access_token) void load(session.access_token);
  }, [session?.access_token, visualItems]);

  async function load(accessToken = session?.access_token) {
    if (!accessToken) return;
    setBusy(true);
    setMessage("Reading your deliberate parking decisions…");
    try {
      const overview = await getNotNowOverview(accessToken);
      setItems(overview.items);
      setMessage(overview.items.length === 0
        ? "Nothing is parked. New thoughts can stay in Brain Dump until a pause is useful."
        : "NOT NOW is current. None of these items is a goal, project, or change in direction.");
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function prepare(item: NotNowItem, targetState: NotNowState) {
    if (targetState === item.state || isTerminal(item.state)) return;
    reviewAttempt.current = undefined;
    setPending({ item, targetState, reviewNote: "" });
    setMessage("Review the exact state change below. Nothing has changed yet.");
  }

  async function commit() {
    const accessToken = session?.access_token;
    if (!pending || !accessToken) return;
    const command = {
      targetState: pending.targetState,
      expectedCurrentRevision: pending.item.revision,
      ...(pending.reviewNote.trim() ? { reviewNote: pending.reviewNote.trim() } : {}),
    };
    const fingerprint = JSON.stringify({ rootId: pending.item.rootId, ...command });
    const attempt = reviewAttempt.current?.fingerprint === fingerprint
      ? reviewAttempt.current
      : { fingerprint, key: crypto.randomUUID() };
    reviewAttempt.current = attempt;
    setBusy(true);
    setMessage("Recording your reviewed NOT NOW decision…");
    try {
      const receipt = await reviewNotNowItem(
        accessToken,
        pending.item.rootId,
        command,
        attempt.key,
      );
      reviewAttempt.current = undefined;
      setPending(undefined);
      await load(accessToken);
      setMessage(receipt.status === "replayed"
        ? "The earlier review was safely replayed. No duplicate revision was created."
        : `${stateLabels[receipt.state]} is now current. No other Life OS domain changed.`);
    } catch (error) {
      if (error instanceof LifeOsApiError && error.code === "not_now_item_changed") {
        reviewAttempt.current = undefined;
        setPending(undefined);
        await load(accessToken);
      }
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.canvas}>
      <header className="system-bar">
        <div className="wordmark">LIFE<span>/</span>OS</div>
        <div className="system-state"><i />PRIVATE · NOT NOW</div>
      </header>

      <section className={styles.hero}>
        <span>DELIBERATE PARKING LOT</span>
        <h1>Not abandoned.<br />Not committed.</h1>
        <div>
          <p>Ideas can remain visible without pulling you away from the direction you already chose.</p>
          <Link href="/capture">Return to Brain Dump</Link>
        </div>
      </section>

      <section className={styles.boundary}>
        <span>AUTHORITY BOUNDARY</span>
        <strong>Every item here is a user decision about attention—not a goal, project, or canonical direction change.</strong>
      </section>

      <section className={styles.list} aria-label="Current NOT NOW items">
        {items.length === 0 && <p className={styles.empty}>The parking lot is empty.</p>}
        {items.map((item) => (
          <article className={styles.item} data-state={item.state} key={item.rootId}>
            <div className={styles.itemTop}>
              <span>{assessmentLabels[item.assessment]}</span>
              <time>{shortDate(item.decidedAt)}</time>
            </div>
            <blockquote>{item.rawText}</blockquote>
            <dl>
              <div><dt>Current state</dt><dd>{stateLabels[item.state]}</dd></div>
              <div><dt>Authority</dt><dd>USER DECISION · organizational only</dd></div>
              <div><dt>Revision</dt><dd>{item.revision}</dd></div>
            </dl>
            {item.reviewNote && <p className={styles.note}><span>REFLECTION</span>{item.reviewNote}</p>}
            {!isTerminal(item.state) && (
              <div className={styles.actions} aria-label={`Review actions for ${item.rootId}`}>
                {actionLabels.map(([state, label]) => (
                  <button disabled={busy || state === item.state} key={state} onClick={() => prepare(item, state)} type="button">{label}</button>
                ))}
              </div>
            )}
            {isTerminal(item.state) && <p className={styles.terminal}>FINAL V1 STATE · provenance retained</p>}
          </article>
        ))}
      </section>

      {pending && (
        <aside className={styles.review}>
          <span>FINAL REVIEW · NO WRITE YET</span>
          <h2>{stateLabels[pending.item.state]} → {stateLabels[pending.targetState]}</h2>
          <blockquote>{pending.item.rawText}</blockquote>
          <label>Optional reflection
            <textarea
              disabled={busy}
              maxLength={4000}
              onChange={(event) => {
                setPending({ ...pending, reviewNote: event.target.value });
                reviewAttempt.current = undefined;
              }}
              placeholder="Why this is the right attention decision now"
              rows={4}
              value={pending.reviewNote}
            />
          </label>
          <p>This creates a new NOT NOW revision only. It cannot promote the thought or change Direction, Journey, Calendar, Today, Memory, a goal, or a project.</p>
          <div><button disabled={busy} onClick={() => setPending(undefined)} type="button">Keep reviewing</button><button disabled={busy} onClick={() => void commit()} type="button">Record this decision</button></div>
        </aside>
      )}

      {message && <p className={styles.message} role="status">{message}</p>}
    </main>
  );
}
