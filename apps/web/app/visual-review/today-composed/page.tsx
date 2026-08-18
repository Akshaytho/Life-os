import { notFound } from "next/navigation";
import type { CanonicalCalendarItem } from "../../../../../packages/contracts/canonical-calendar";
import { TodayComposition, type TodayCompositionModel } from "../../../components/today-composition";
import styles from "../../../components/live-today.module.css";

function enabled() { return process.env.LIFE_OS_VISUAL_REVIEW_ENABLED?.trim().toLowerCase() === "true" }
const now = "2026-08-19T12:00:00.000Z";
const calendar: CanonicalCalendarItem[] = [{ id:"work", title:"Software work", startsAt:"2026-08-19T04:00:00.000Z", endsAt:"2026-08-19T12:30:00.000Z", category:"Work", commitment:"Fixed", authorityClass:"FACT", committedAt:"2026-08-18T10:00:00.000Z" }];
const model: TodayCompositionModel = {
  direction:{ id:"direction", statement:"Build the financial and creative foundation for long-term travel while continuing the software job during the foundation period.", status:"ACTIVE", authorityClass:"DECISION", decidedAt:"2026-08-12T09:00:00.000Z" },
  journey:{ activation:{ decisionId:"journey", journeyCode:"TRAVEL_CREATOR", capabilityCode:"SOUND_DESIGN", startingTechnique:"ENVIRONMENTAL_SOUND", authorityClass:"DECISION", decidedAt:"2026-08-12T09:00:00.000Z", recordedAt:"2026-08-12T09:00:01.000Z" }, openSession:null, completedSessions:[], practiceCounts:{} },
  drift:{ driftId:"drift", sourceNote:"A new creator path suddenly felt urgent.", authorityClass:"USER_SOURCE", occurredAt:"2026-08-19T09:00:00.000Z", recordedAt:"2026-08-19T09:00:01.000Z", lifecycleState:"STILL_RETURNING", currentDecision:{ decisionId:"drift-decision", rootDecisionId:"drift-decision", revision:1, explanation:"COMPARISON", returnPosture:"RETURN_TO_DIRECTION", lifecycleState:"STILL_RETURNING", status:"CURRENT", authorityClass:"DECISION", decidedAt:"2026-08-19T09:05:00.000Z", recordedAt:"2026-08-19T09:05:01.000Z" }, decisionHistory:[] },
  retainedLearning:{ itemId:"memory-v2", rootId:"memory", revision:2, kind:"LEARNING", title:"Room tone reveals layering choices", body:"A short A/B comparison makes environmental layers easier to hear before adding complexity.", authorityClass:"REFLECTION", relationship:"REINFORCES", relatedRootId:"small-return", relatedTitle:"Return can stay small", status:"CURRENT", retainedAt:"2026-08-18T18:30:00.000Z", recordedAt:"2026-08-18T18:30:01.000Z", source:{ domain:"JOURNEY_PRACTICE", entityId:"completion", label:"Journey practice · Environmental sound", occurredAt:"2026-08-18T17:45:00.000Z", authorityClass:"REFLECTION" }, history:[] },
};

export default function Page(){
  if(!enabled()) notFound();
  return <div className="life-app"><main className={styles.canvas}>
    <header className="system-bar"><div className="wordmark">LIFE<span>/</span>OS</div><div className="system-state"><i/>PRIVATE · TODAY COMPOSITION</div></header>
    <section className={styles.hero}><div className={styles.heroTop}><span>TODAY / SYNTHETIC VISUAL REVIEW</span><span>ASIA/KOLKATA</span></div><div className={styles.heroGrid}><div><span className="section-kicker">CURRENT REALITY</span><h1>Wednesday, August 19</h1></div><div className={styles.clockBlock}><span>LOCAL NOW</span><strong>5:30 PM</strong></div></div><p className={styles.orientation}>Direction guides. Calendar constrains. Journey supplies evidence. Reflection stays reflection.</p></section>
    <TodayComposition calendar={calendar} model={model} now={now} part="COMPASS"/>
    <section className={styles.nowSection}><article className={styles.primarySignal} data-state="current"><span>HAPPENING NOW · FACT</span><strong>Software work</strong><p>9:30 AM → 6:00 PM · Work · Fixed</p></article><article className={styles.nextSignal}><span>NEXT CANONICAL EVENT</span><strong>Nothing else is committed.</strong><p>No suggestion was promoted into Calendar.</p></article></section>
    <TodayComposition calendar={calendar} model={model} now={now} part="DETAIL"/>
  </main></div>;
}
