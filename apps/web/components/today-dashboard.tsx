import type { CalendarPreviewItem, EvidenceStage, SourceRef, TodayViewModel, TrustClass } from "../lib/types";

type IconName = "today" | "journey" | "calendar" | "memory" | "you" | "plus" | "compass" | "spark" | "check" | "arrow";

type NavItem = { label: string; icon: IconName; active: boolean };

const navItems: NavItem[] = [
  { label: "Today", icon: "today", active: true },
  { label: "Journey", icon: "journey", active: false },
  { label: "Calendar", icon: "calendar", active: false },
  { label: "Memory", icon: "memory", active: false },
  { label: "You", icon: "you", active: false },
];

const trustLabels: Record<TrustClass, string> = {
  FACT: "Fact",
  REFLECTION: "Reflection",
  OBSERVATION: "Observation",
  SUGGESTION: "Suggestion",
  DECISION: "Decision",
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "today") return <svg {...common}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M22 12h-3M12 22v-3M2 12h3" /></svg>;
  if (name === "journey") return <svg {...common}><path d="M4 18c4-8 7-11 16-13" /><circle cx="5" cy="18" r="2" /><path d="m16 4 4 1-1 4" /></svg>;
  if (name === "calendar") return <svg {...common}><path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z" /><path d="M7 2v4M17 2v4M3 9h18" /></svg>;
  if (name === "memory") return <svg {...common}><path d="M6 3h10a3 3 0 0 1 3 3v15H8a3 3 0 0 1-3-3V4a1 1 0 0 1 1-1Z" /><path d="M8 21a3 3 0 0 1 0-6h11M9 8h6M9 11h4" /></svg>;
  if (name === "you") return <svg {...common}><circle cx="12" cy="8" r="3" /><path d="M5.5 20c.8-4.1 3-6.1 6.5-6.1s5.7 2 6.5 6.1" /></svg>;
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === "compass") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m15.7 8.3-2.4 5-5 2.4 2.4-5 5-2.4Z" /></svg>;
  if (name === "spark") return <svg {...common}><path d="M12 3c.7 4.3 2.4 6 6.5 6.5C14.4 10 12.7 11.7 12 16c-.7-4.3-2.4-6-6.5-6.5C9.6 9 11.3 7.3 12 3Z" /></svg>;
  if (name === "arrow") return <svg {...common}><path d="M5 12h14M14 7l5 5-5 5" /></svg>;
  return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;
}

function TrustTag({ kind }: { kind: TrustClass }) {
  return <span className={`trust-tag trust-${kind.toLowerCase()}`}>{trustLabels[kind]}</span>;
}

function Provenance({ source, compact = false }: { source: SourceRef; compact?: boolean }) {
  return (
    <details className={`source-disclosure ${compact ? "source-compact" : ""}`}>
      <summary><TrustTag kind={source.trustClass} /><span className="source-word">source</span></summary>
      <div className="source-panel"><strong>{source.label}</strong><span>{source.detail}</span><span>{source.recordedAt}</span></div>
    </details>
  );
}

function toMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

const DAY_START = 9 * 60;
const DAY_END = 21 * 60;
const DAY_SPAN = DAY_END - DAY_START;

function DayBand({ item }: { item: CalendarPreviewItem }) {
  const start = toMinutes(item.time);
  const end = toMinutes(item.endTime);
  const top = ((start - DAY_START) / DAY_SPAN) * 100;
  const height = ((end - start) / DAY_SPAN) * 100;
  return (
    <div
      className={`day-band band-${item.category.toLowerCase()} band-${item.state.toLowerCase()}`}
      style={{ top: `${top}%`, height: `${height}%` }}
    >
      <span className="band-edge" />
      <div className="band-copy">
        <div className="band-line"><span>{item.category}</span><span>{item.commitment}</span></div>
        <strong>{item.title}</strong>
        <p>{item.detail}</p>
      </div>
    </div>
  );
}

function TimePlane({ model }: { model: TodayViewModel }) {
  const clock = toMinutes(model.day.sampleClock);
  const nowTop = ((clock - DAY_START) / DAY_SPAN) * 100;
  const ticks = [
    { time: "09", top: 0 },
    { time: "12", top: 25 },
    { time: "15", top: 50 },
    { time: "18", top: 75 },
    { time: "21", top: 100 },
  ];

  return (
    <div className="time-plane" aria-label="Visual day timeline from 9 AM to 9 PM">
      <div className="time-scale">
        {ticks.map((tick) => <span key={tick.time} style={{ top: `${tick.top}%` }}>{tick.time}</span>)}
      </div>
      <div className="time-grid">
        {ticks.map((tick) => <i key={tick.time} style={{ top: `${tick.top}%` }} />)}
        {model.day.items.map((item) => <DayBand item={item} key={item.id} />)}
        <div className="now-line" style={{ top: `${nowTop}%` }}><span>NOW · {model.day.sampleClock}</span><i /></div>
      </div>
    </div>
  );
}

function EvidencePath({ stages }: { stages: EvidenceStage[] }) {
  return (
    <div className="evidence-path" aria-label="Skill evidence path">
      {stages.map((stage, index) => (
        <div className={`evidence-stage evidence-${stage.state.toLowerCase()}`} key={stage.label}>
          <div className="evidence-node">{stage.state === "COMPLETE" ? <Icon name="check" size={12} /> : index + 1}</div>
          <span>{stage.label}</span>
          {index < stages.length - 1 && <i />}
        </div>
      ))}
    </div>
  );
}

function NavButton({ item }: { item: NavItem }) {
  return <button className={`nav-button ${item.active ? "active" : ""}`} disabled={!item.active} aria-current={item.active ? "page" : undefined}><Icon name={item.icon} size={20} /><span>{item.label}</span></button>;
}

function AppNavigation() {
  return (
    <>
      <aside className="desktop-nav" aria-label="Primary navigation">
        <div className="desktop-brand"><span>L/O</span><small>PRIVATE</small></div>
        <div className="desktop-links">{navItems.map((item) => <NavButton item={item} key={item.label} />)}</div>
        <button className="desktop-capture" disabled><Icon name="plus" size={22} /><span>Capture</span></button>
      </aside>
      <nav className="bottom-nav" aria-label="Primary navigation">
        {navItems.map((item) => <NavButton item={item} key={item.label} />)}
      </nav>
      <button className="floating-capture" disabled aria-label="Capture"><Icon name="plus" size={25} /><span>Capture</span></button>
    </>
  );
}

export function TodayDashboard({ model }: { model: TodayViewModel }) {
  return (
    <div className="life-app">
      <AppNavigation />
      <main className="today-canvas">
        <header className="system-bar">
          <div className="wordmark">LIFE<span>/</span>OS</div>
          <div className="system-state"><i />PRIVATE · SAMPLE</div>
        </header>

        {model.demoMode && (
          <details className="prototype-note">
            <summary>Prototype state <span>no real writes</span></summary>
            <p>Everything shown is sample data. Actions remain disabled until canonical persistence and domain events exist.</p>
          </details>
        )}

        <section className="hero-instrument">
          <div className="hero-date"><span>{model.dateLabel}</span><strong>{model.dayPart}</strong></div>
          <div className="hero-grid">
            <div className="clock-face">
              <span className="clock-label">LOCAL / SAMPLE</span>
              <strong>{model.day.sampleClock}</strong>
              <span className="clock-state">{model.stateLabel}</span>
            </div>
            <div className="hero-copy">
              <span className="section-kicker">CURRENT WINDOW</span>
              <h1>Evening window.</h1>
              <p>{model.orientation}</p>
            </div>
          </div>

          <div className="next-pulse">
            <div className="pulse-ring"><span>22</span><small>MIN</small></div>
            <div className="pulse-copy"><span>NEXT</span><strong>Gym at 18:30</strong><p>Close work. Move. Train.</p></div>
            <Icon name="arrow" size={19} />
          </div>

          <div className="north-star">
            <Icon name="compass" size={23} />
            <div><span>NORTH STAR</span><strong>{model.direction.title}</strong></div>
            <Provenance source={model.direction.source} compact />
          </div>
        </section>

        <section className="day-section">
          <div className="section-heading">
            <div><span className="section-kicker">ACTUAL CAPACITY</span><h2>The shape of today</h2></div>
            <div className="day-key"><span><i className="key-fixed" />fixed</span><span><i className="key-open" />open</span></div>
          </div>
          <p className="section-intro">Time is the data. Long blocks take real space; open gaps stay visible.</p>
          <TimePlane model={model} />
          <div className="day-readout">
            <div><strong>09h</strong><span>work</span></div>
            <div><strong>01h15</strong><span>open / transition</span></div>
            <div><strong>01h45</strong><span>body + craft</span></div>
          </div>
          <Provenance source={model.day.source} compact />
        </section>

        <section className="focus-section">
          <div className="section-heading"><div><span className="section-kicker">THREE SIGNALS</span><h2>What deserves a place</h2></div></div>
          <div className="focus-track">
            {model.focus.map((item, index) => (
              <div className={`focus-row focus-${item.state.toLowerCase()}`} key={item.id}>
                <span className="focus-index">0{index + 1}</span>
                <span className="focus-mark">{item.state === "DONE" ? <Icon name="check" size={14} /> : null}</span>
                <div><strong>{item.label}</strong><span>{item.reason}</span></div>
                <em>{item.state === "DONE" ? "done" : item.state === "ACTIVE" ? "now" : "later"}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="craft-section">
          <div className="craft-topline"><span>JOURNEY 01 / {model.creator.journey.toUpperCase()}</span><Provenance source={model.creator.source} compact /></div>
          <div className="craft-title"><span className="craft-number">01</span><div><span>{model.creator.phase}</span><h2>{model.creator.skill}</h2></div></div>
          <div className="craft-technique"><span>ACTIVE EXPERIMENT</span><strong>{model.creator.technique}</strong><p>{model.creator.intent}</p></div>
          <div className="evidence-wrap"><div className="evidence-header"><span>EVIDENCE / NOT MASTERY</span><strong>Review → repeat</strong></div><EvidencePath stages={model.creator.evidenceStages} /></div>
          <div className="craft-data">
            <div><strong>{model.creator.evidenceCounts.practices.toString().padStart(2, "0")}</strong><span>practice sessions</span></div>
            <div><strong>{model.creator.evidenceCounts.reels.toString().padStart(2, "0")}</strong><span>reels applied</span></div>
            <div><strong>{model.creator.evidenceCounts.learnings.toString().padStart(2, "0")}</strong><span>learnings kept</span></div>
          </div>
          <div className="learning-strip"><span>LATEST LEARNING</span><p>{model.creator.latestLearning}</p></div>
          <div className="experiment-strip"><div><span>NEXT EXPERIMENT</span><p>{model.creator.nextExperiment}</p></div><button disabled>Start <Icon name="arrow" size={18} /></button></div>
        </section>

        <aside className="guidance-note">
          <div className="guidance-glyph"><Icon name="spark" size={20} /></div>
          <div className="guidance-copy"><TrustTag kind="SUGGESTION" /><h2>{model.suggestion.title}</h2><p>{model.suggestion.body}</p><details><summary>Why this?</summary><p>{model.suggestion.basis}</p></details></div>
          <Provenance source={model.suggestion.source} compact />
        </aside>

        <section className="review-section">
          <div><span className="section-kicker">LATER / CLOSE THE LOOP</span><h2>{model.review.title}</h2><p>{model.review.prompt}</p></div>
          <button disabled>Evening review <Icon name="arrow" size={18} /></button>
        </section>

        <footer className="page-footer"><span>Life OS / V3 instrument study</span><span>sample state · provenance visible · writes disabled</span></footer>
      </main>
    </div>
  );
}
