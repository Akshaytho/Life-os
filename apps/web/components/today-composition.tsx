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

function focus(items: CanonicalCalendarItem[], now: string, journey: JourneyPracticeOverview) {
  const current = items.find((item) => item.commitment === "Fixed" && Date.parse(item.startsAt) <= Date.parse(now) && Date.parse(item.endsAt) > Date.parse(now));
  if (current) return { authority: "FACT", title: current.title, reason: "Protect the Calendar commitment already happening." };
  if (journey.openSession) return { authority: "FACT", title: `Active ${label(journey.openSession.technique)} practice`, reason: "Finish or deliberately stop the practice already in progress." };
  const next = items.find((item) => Date.parse(item.startsAt) > Date.parse(now));
  if (next && Date.parse(next.startsAt) - Date.parse(now) <= 60 * 60 * 1000) {
    return { authority: "FACT", title: `Leave room for ${next.title}`, reason: "The next canonical commitment begins within an hour." };
  }
  if (journey.activation) return {
    authority: "SUGGESTION",
    title: `One small ${label(journey.activation.startingTechnique)} experiment`,
    reason: "Derived from the active Journey capability. Not a task or Calendar commitment.",
  };
  return { authority: "EMPTY", title: "No deliberate focus is claimed.", reason: "Life OS did not invent one without an active owner." };
}

export function TodayComposition({ model, calendar, now, part }: { model: TodayCompositionModel; calendar: CanonicalCalendarItem[]; now: string; part: "COMPASS" | "DETAIL" }) {
  const deliberate = focus(calendar, now, model.journey);
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
      <section className={styles.orientation} aria-label="Today focus and Journey orientation">
        <article className={styles.focus} data-authority={deliberate.authority}>
          <span>DELIBERATE FOCUS · {deliberate.authority}</span>
          <h2>{deliberate.title}</h2>
          <p>{deliberate.reason}</p>
        </article>
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
