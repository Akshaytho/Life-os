import Link from "next/link";
import type { CanonicalCalendarItem } from "../../../packages/contracts/canonical-calendar";
import type { CurrentDirectionDecision } from "../../../packages/contracts/direction";
import type { DriftOccurrence } from "../../../packages/contracts/drift-return";
import type { JourneyPracticeOverview } from "../../../packages/contracts/journey-practice";
import type { MemoryItem } from "../../../packages/contracts/memory";
import styles from "./today-composition.module.css";

export interface TodayCompositionModel {
  direction: CurrentDirectionDecision | null;
  journey: JourneyPracticeOverview;
  drift: DriftOccurrence | null;
  retainedLearning: MemoryItem | null;
}

function label(value: string) { return value.replaceAll("_", " ") }

function nextAction(items: CanonicalCalendarItem[], now: string, journey: JourneyPracticeOverview) {
  const current = items.find((item) => item.commitment === "Fixed" && Date.parse(item.startsAt) <= Date.parse(now) && Date.parse(item.endsAt) > Date.parse(now));
  if (current) return {
    authority: "SUGGESTION",
    sourceAuthority: "FACT",
    title: `Stay with ${current.title} · 5 minutes.`,
    reason: "From the fixed Calendar commitment already happening. No new commitment was created.",
    href: "/calendar",
    cta: "See this commitment",
  } as const;

  if (journey.openSession) return {
    authority: "SUGGESTION",
    sourceAuthority: "FACT",
    title: `Continue ${label(journey.openSession.technique)} practice · 5 minutes.`,
    reason: "From the Journey practice session already in progress. No new Journey decision was created.",
    href: "/journey",
    cta: "Return to practice",
  } as const;

  const next = items.find((item) => Date.parse(item.startsAt) > Date.parse(now));
  if (next && Date.parse(next.startsAt) - Date.parse(now) <= 60 * 60 * 1000) {
    return {
      authority: "SUGGESTION",
      sourceAuthority: "FACT",
      title: `Get ready for ${next.title} · 5 minutes.`,
      reason: "From the next canonical Calendar event because it begins within an hour. No new commitment was created.",
      href: "/calendar",
      cta: "See what is next",
    } as const;
  }

  if (journey.activation) return {
    authority: "SUGGESTION",
    sourceAuthority: "DECISION",
    title: `Try ${label(journey.activation.startingTechnique)} · 5 minutes.`,
    reason: "From your active Journey decision. Not a task or Calendar commitment.",
    href: "/journey",
    cta: "Open Journey",
  } as const;

  return {
    authority: "EMPTY",
    sourceAuthority: "EMPTY",
    title: "No next action is claimed.",
    reason: "Life OS did not invent work without a current owner.",
    href: null,
    cta: null,
  } as const;
}

export function TodayNextAction({ model, calendar, now }: { model: TodayCompositionModel; calendar: CanonicalCalendarItem[]; now: string }) {
  const deliberate = nextAction(calendar, now, model.journey);
  return (
    <article className={styles.focus} data-authority={deliberate.authority}>
      <span>DO NEXT · {deliberate.authority}{deliberate.sourceAuthority !== "EMPTY" ? ` · FROM ${deliberate.sourceAuthority}` : ""}</span>
      <h2>{deliberate.title}</h2>
      <p>{deliberate.reason}</p>
      {deliberate.href && deliberate.cta && <Link href={deliberate.href}>{deliberate.cta}</Link>}
    </article>
  );
}

export function TodayComposition({ model, part }: { model: TodayCompositionModel; part: "COMPASS" | "DETAIL" }) {
  const latest = model.journey.openSession ?? model.journey.completedSessions[0] ?? null;
  if (part === "COMPASS") return (
    <section className={styles.compass} aria-label="Current Direction compass">
      <span>COMPASS · YOU · {model.direction ? "DECISION" : "EMPTY"}</span>
      <strong>{model.direction?.statement ?? "No current Direction decision exists."}</strong>
      <Link href="/you">Inspect Direction</Link>
    </section>
  );
  return (
    <>
      <section className={styles.orientation} aria-label="Journey orientation">
        <article className={styles.journey}>
          <span>JOURNEY · {model.journey.activation ? "DECISION" : "EMPTY"}</span>
          <h2>{model.journey.activation ? label(model.journey.activation.capabilityCode) : "No active capability"}</h2>
          <p>{latest ? `${latest.lifecycleState} · ${label(latest.technique)} · FACT` : model.journey.activation ? `Start with ${label(model.journey.activation.startingTechnique)} when reality allows.` : "Nothing was activated automatically."}</p>
          <Link href="/journey">Open Journey</Link>
        </article>
      </section>

      {(model.drift || model.retainedLearning) && <section className={styles.attention} aria-label="Useful attention">
        {model.drift && <article><span>DRIFT · {model.drift.currentDecision ? "DECISION" : "USER SOURCE"}</span><strong>{model.drift.currentDecision ? `${label(model.drift.currentDecision.explanation)} · ${label(model.drift.currentDecision.returnPosture ?? "STILL_RETURNING")}` : "Recorded, not yet understood"}</strong><p>Return is the goal, not zero drift.</p><Link href="/drift">Continue return</Link></article>}
        {model.retainedLearning && <article><span>MEMORY · REFLECTION · OPTIONAL CONTEXT</span><strong>{model.retainedLearning.title}</strong><p>{model.retainedLearning.body}</p><Link href="/memory">Inspect source and history</Link></article>}
      </section>}
    </>
  );
}