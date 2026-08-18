"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  PeriodicReviewKind,
  PeriodicReviewOverview,
  SubmitPeriodicReviewCommand,
} from "../../../packages/contracts/periodic-reviews";
import {
  getPeriodicReviewOverview,
  LifeOsApiError,
  submitPeriodicReview,
} from "../lib/life-os-api";
import { useLifeOsAuth } from "./life-os-auth-provider";
import styles from "./live-periodic-reviews.module.css";

type Answers = Pick<SubmitPeriodicReviewCommand,
  "whatMattered" | "whatChanged" | "whatMovedForward" | "driftAndReturn"
  | "whatWasLearned" | "carryForward" | "worthPreserving">;

const emptyAnswers: Answers = {
  whatMattered: "", whatChanged: "", whatMovedForward: "", driftAndReturn: "",
  whatWasLearned: "", carryForward: "", worthPreserving: "",
};

const prompts: Array<{ key: keyof Answers; number: string; label: string; optional?: boolean }> = [
  { key: "whatMattered", number: "01", label: "What actually mattered in this period?" },
  { key: "whatChanged", number: "02", label: "What meaningfully changed?" },
  { key: "whatMovedForward", number: "03", label: "What moved forward—and what evidence supports that?" },
  { key: "driftAndReturn", number: "04", label: "Where did I drift, return, or keep returning?" },
  { key: "whatWasLearned", number: "05", label: "What did I learn?" },
  { key: "carryForward", number: "06", label: "What do I choose to carry forward?" },
  { key: "worthPreserving", number: "07", label: "What may be worth preserving later?", optional: true },
];

function dateOf(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function datePlus(value: string, days: number) {
  const date = dateOf(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localDate(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function startFor(kind: PeriodicReviewKind, value: string) {
  const date = dateOf(value);
  if (kind === "MONTH") {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
  }
  const daysFromMonday = (date.getUTCDay() + 6) % 7;
  return datePlus(value, -daysFromMonday);
}

function endFor(kind: PeriodicReviewKind, start: string) {
  if (kind === "WEEK") return datePlus(start, 6);
  const date = dateOf(start);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

function shiftStart(kind: PeriodicReviewKind, start: string, amount: number) {
  if (kind === "WEEK") return datePlus(start, amount * 7);
  const date = dateOf(start);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1)).toISOString().slice(0, 10);
}

function zonedMidnight(local: string, timeZone: string) {
  const [year, month, day] = local.split("-").map(Number);
  const target = Date.UTC(year!, month! - 1, day!);
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const number = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
    const observed = Date.UTC(number("year"), number("month") - 1, number("day"), number("hour"), number("minute"), number("second"));
    instant += target - observed;
  }
  return new Date(instant).toISOString();
}

function label(identity: { kind: PeriodicReviewKind; periodStart: string; periodEnd: string }) {
  const format = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  if (identity.kind === "MONTH") {
    return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(dateOf(identity.periodStart));
  }
  return `${format.format(dateOf(identity.periodStart))} — ${format.format(dateOf(identity.periodEnd))}`;
}

function safeMessage(error: unknown) {
  if (error instanceof LifeOsApiError) {
    if (error.code === "authentication_required") return "Your private session expired before this review completed.";
    if (error.code === "periodic_reviews_unavailable" || error.code === "not_found") return "Weekly + Monthly Reviews is not enabled in this private runtime yet.";
    if (error.code === "current_review_changed") return "This review changed after it loaded. Life OS refused the stale revision.";
    if (error.code === "review_unchanged") return "Those exact reflections are already the current review.";
    if (error.code === "network_unavailable") return "Life OS could not reach the private Reviews boundary. The same submission can be retried safely.";
  }
  return "Life OS could not complete this period review. Private details were not exposed.";
}

function answersFrom(overview: PeriodicReviewOverview): Answers {
  const review = overview.currentReview;
  return review ? {
    whatMattered: review.whatMattered,
    whatChanged: review.whatChanged,
    whatMovedForward: review.whatMovedForward,
    driftAndReturn: review.driftAndReturn,
    whatWasLearned: review.whatWasLearned,
    carryForward: review.carryForward,
    worthPreserving: review.worthPreserving ?? "",
  } : { ...emptyAnswers };
}

function sourceDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));
}

export function LivePeriodicReviews({ visualOverview }: { visualOverview?: PeriodicReviewOverview }) {
  const { session } = useLifeOsAuth();
  const timeZone = useMemo(() => visualOverview?.timeZone
    ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC", [visualOverview?.timeZone]);
  const [kind, setKind] = useState<PeriodicReviewKind>(visualOverview?.kind ?? "WEEK");
  const [periodStart, setPeriodStart] = useState(() => visualOverview?.periodStart
    ?? startFor("WEEK", localDate(timeZone)));
  const [overview, setOverview] = useState<PeriodicReviewOverview | undefined>(visualOverview);
  const [answers, setAnswers] = useState<Answers>(() => visualOverview ? answersFrom(visualOverview) : { ...emptyAnswers });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(visualOverview ? "Synthetic visual-review context · no database call" : "");
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<{ fingerprint: string; key: string }>();

  const periodEnd = endFor(kind, periodStart);

  useEffect(() => {
    if (visualOverview || !session?.access_token) return;
    void load(session.access_token, kind, periodStart);
  }, [session?.access_token, kind, periodStart, visualOverview]);

  async function load(accessToken: string, requestedKind: PeriodicReviewKind, requestedStart: string) {
    setBusy(true);
    setMessage("Reading the period from canonical sources…");
    setConfirming(false);
    try {
      const requestedEnd = endFor(requestedKind, requestedStart);
      const result = await getPeriodicReviewOverview(accessToken, {
        kind: requestedKind,
        periodStart: requestedStart,
        periodEnd: requestedEnd,
        timeZone,
        calendarFrom: zonedMidnight(requestedStart, timeZone),
        calendarTo: zonedMidnight(datePlus(requestedEnd, 1), timeZone),
      });
      setOverview(result);
      setAnswers(answersFrom(result));
      setMessage(result.sources.length
        ? `${result.sources.length} source records are available for deliberate review.`
        : "This period is empty. Life OS did not manufacture activity.");
    } catch (error) { setMessage(safeMessage(error)) }
    finally { setBusy(false) }
  }

  function chooseKind(next: PeriodicReviewKind) {
    const nextStart = startFor(next, periodStart);
    setKind(next);
    setPeriodStart(nextStart);
    setOverview(undefined);
  }

  function requestKey(command: SubmitPeriodicReviewCommand) {
    const fingerprint = JSON.stringify(command);
    if (pending?.fingerprint === fingerprint) return pending.key;
    const key = `periodic-review-${crypto.randomUUID()}`;
    setPending({ fingerprint, key });
    return key;
  }

  function command(): SubmitPeriodicReviewCommand {
    return {
      kind, periodStart, periodEnd, timeZone,
      whatMattered: answers.whatMattered,
      whatChanged: answers.whatChanged,
      whatMovedForward: answers.whatMovedForward,
      driftAndReturn: answers.driftAndReturn,
      whatWasLearned: answers.whatWasLearned,
      carryForward: answers.carryForward,
      ...(answers.worthPreserving?.trim() ? { worthPreserving: answers.worthPreserving } : {}),
      expectedCurrentReviewId: overview?.currentReview?.id ?? null,
    };
  }

  const requiredComplete = prompts.filter((prompt) => !prompt.optional)
    .every((prompt) => answers[prompt.key]?.trim());

  async function commit() {
    if (!session?.access_token || !requiredComplete || visualOverview) return;
    const value = command();
    setBusy(true);
    setMessage("Saving this exact reflection as a new review revision…");
    try {
      const receipt = await submitPeriodicReview(session.access_token, value, requestKey(value));
      setPending(undefined);
      setConfirming(false);
      setMessage(receipt.status === "replayed"
        ? "This review had already committed safely; Life OS returned the same receipt."
        : "Review saved as REFLECTION. No source domain or Memory changed.");
      await load(session.access_token, kind, periodStart);
    } catch (error) { setMessage(safeMessage(error)) }
    finally { setBusy(false) }
  }

  const counts = overview?.sourceCounts;
  return (
    <div className="life-app">
      <main className={styles.canvas}>
        <header className="system-bar"><div className="wordmark">LIFE<span>/</span>OS</div><div className="system-state"><i />PRIVATE · REVIEWS / REFLECTION</div></header>
        <section className={styles.hero}>
          <span className="section-kicker">TIME COMPRESSION, NOT A SCORE</span>
          <h1>Review what<br />meaningfully changed.</h1>
          <p>Life OS brings the period&apos;s records together. You decide what mattered, what you learned, and what to carry forward.</p>
          <Link href="/">Return to Today</Link>
        </section>

        <section className={styles.periodControls} aria-label="Review period controls">
          <div className={styles.kindTabs}>
            {(["WEEK", "MONTH"] as const).map((value) => <button aria-pressed={kind === value} disabled={busy || Boolean(visualOverview)} key={value} onClick={() => chooseKind(value)} type="button">{value === "WEEK" ? "Week" : "Month"}</button>)}
          </div>
          <div className={styles.periodNav}>
            <button disabled={busy || Boolean(visualOverview)} onClick={() => setPeriodStart(shiftStart(kind, periodStart, -1))} type="button">← Previous</button>
            <div><span>{kind} / LOCAL TIME</span><strong>{label({ kind, periodStart, periodEnd })}</strong></div>
            <button disabled={busy || Boolean(visualOverview)} onClick={() => setPeriodStart(shiftStart(kind, periodStart, 1))} type="button">Next →</button>
          </div>
        </section>

        {message && <section className={styles.status} aria-live="polite"><span>REVIEW BOUNDARY</span><p>{message}</p></section>}

        <section className={styles.evidence}>
          <div className={styles.sectionHeading}><div><span>01 / WHAT LIFE OS CAN SHOW</span><h2>The period, as recorded.</h2></div><p>Counts describe retrieved records. They do not grade the period or decide what mattered.</p></div>
          <div className={styles.counts}>
            <div><strong>{counts?.dailyReviews ?? 0}</strong><span>daily reviews</span></div>
            <div><strong>{counts?.calendarEvents ?? 0}</strong><span>Calendar facts</span></div>
            <div><strong>{counts?.journeyPractices ?? 0}</strong><span>Journey practices</span></div>
            <div><strong>{counts?.driftOccurrences ?? 0}</strong><span>drift records</span></div>
            <div><strong>{counts?.notNowItems ?? 0}</strong><span>NOT NOW decisions</span></div>
            <div><strong>{counts?.weeklyReviews ?? 0}</strong><span>weekly reflections</span></div>
          </div>
          <div className={styles.sources}>
            {(overview?.sources ?? []).slice(0, 12).map((source) => (
              <article key={source.sourceId} data-authority={source.authorityClass}>
                <div><span>{source.domain.replaceAll("_", " ")} · {source.authorityClass}</span><time>{sourceDate(source.occurredAt)}</time></div>
                <h3>{source.title}</h3><p>{source.excerpt}</p>
              </article>
            ))}
          </div>
          {(overview?.sources.length ?? 0) > 12 && <details className={styles.more}><summary>Inspect {overview!.sources.length - 12} more source records</summary><div>{overview!.sources.slice(12).map((source) => <p key={source.sourceId}><b>{source.domain} · {source.authorityClass}</b> — {source.title}: {source.excerpt}</p>)}</div></details>}
          {overview && overview.sources.length === 0 && <div className={styles.empty}>No records were retrieved for this period. Empty stays truthful.</div>}
        </section>

        <section className={styles.reflection}>
          <div className={styles.sectionHeading}><div><span>02 / YOUR COMPRESSION · REFLECTION</span><h2>Close the loop in your own words.</h2></div><p>Review text is versioned reflection. It cannot alter the records above.</p></div>
          <div className={styles.prompts}>
            {prompts.map((prompt) => <label key={prompt.key}><span>{prompt.number} / {prompt.optional ? "OPTIONAL · MEMORY CANDIDATE ONLY" : "REFLECTION"}</span><strong>{prompt.label}</strong><textarea disabled={busy || confirming || Boolean(visualOverview)} maxLength={4000} onChange={(event) => setAnswers((current) => ({ ...current, [prompt.key]: event.target.value }))} rows={4} value={answers[prompt.key] ?? ""} /></label>)}
          </div>
          {!confirming ? <button className={styles.primary} disabled={busy || !requiredComplete || Boolean(visualOverview)} onClick={() => setConfirming(true)} type="button">Review before saving →</button> : (
            <aside className={styles.confirm}>
              <span>FINAL REVIEW · USER DECISION</span><h3>Save this {kind.toLowerCase()} as reflection?</h3>
              <p>This creates a new versioned review. It does not change Direction, Journey, Calendar, Memory, NOT NOW, or Drift.</p>
              <div><button disabled={busy} onClick={() => setConfirming(false)} type="button">Keep editing</button><button disabled={busy} onClick={() => void commit()} type="button">{busy ? "Saving…" : "Save review"}</button></div>
            </aside>
          )}
        </section>

        <aside className={styles.nothingChanged}><strong>No automatic truth changes.</strong><p>Reviews compress time. Source domains remain authoritative, and “worth preserving” remains only a candidate until a later explicit Memory decision.</p></aside>
        <footer className={styles.footer}><span>PERIODIC-REVIEWS-V1</span><span>USER-AUTHORED · VERSIONED · RLS-SCOPED</span></footer>
      </main>
    </div>
  );
}
