import type { CalendarPreviewItem, EvidenceStage, SourceRef, TodayViewModel, TrustClass } from "../lib/types";

type IconName = "today" | "journey" | "calendar" | "memory" | "you" | "plus" | "compass" | "spark" | "check";

type NavItem = {
  label: string;
  icon: IconName;
  active: boolean;
};

const navItems: NavItem[] = [
  { label: "Today", icon: "today", active: true },
  { label: "Journey", icon: "journey", active: false },
  { label: "Calendar", icon: "calendar", active: false },
  { label: "Memory", icon: "memory", active: false },
  { label: "You", icon: "you", active: false },
];

const trustLabels: Record<TrustClass, string> = {
  FACT: "Fact",
  REFLECTION: "Your reflection",
  OBSERVATION: "Observation",
  SUGGESTION: "Suggestion",
  DECISION: "Your decision",
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

  if (name === "today") return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
  if (name === "journey") return <svg {...common}><path d="M5 19c3-7 5-11 14-14" /><path d="M14 5h5v5" /><circle cx="6" cy="18" r="2" /></svg>;
  if (name === "calendar") return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 10h18" /></svg>;
  if (name === "memory") return <svg {...common}><path d="M6 4h11a2 2 0 0 1 2 2v14H8a3 3 0 0 1-3-3V5a1 1 0 0 1 1-1Z" /><path d="M8 20a3 3 0 0 1 0-6h11M9 8h6" /></svg>;
  if (name === "you") return <svg {...common}><circle cx="12" cy="8" r="3" /><path d="M5.5 20c.7-4.2 3-6.3 6.5-6.3s5.8 2.1 6.5 6.3" /></svg>;
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === "compass") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z" /></svg>;
  if (name === "spark") return <svg {...common}><path d="M12 3c.8 4 2.4 5.6 6 6-3.6.4-5.2 2-6 6-.8-4-2.4-5.6-6-6 3.6-.4 5.2-2 6-6Z" /><path d="M18 15c.4 2 1.2 2.8 3 3-1.8.2-2.6 1-3 3-.4-2-1.2-2.8-3-3 1.8-.2 2.6-1 3-3Z" /></svg>;
  return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;
}

function TrustTag({ kind }: { kind: TrustClass }) {
  return <span className={`trust-tag trust-${kind.toLowerCase()}`}>{trustLabels[kind]}</span>;
}

function Provenance({ source }: { source: SourceRef }) {
  return (
    <details className="source-disclosure">
      <summary><TrustTag kind={source.trustClass} /><span>Source</span></summary>
      <div className="source-panel"><strong>{source.label}</strong><span>{source.detail}</span><span>{source.recordedAt}</span></div>
    </details>
  );
}

function ScheduleItem({ item }: { item: CalendarPreviewItem }) {
  return (
    <div className={`schedule-entry schedule-${item.category.toLowerCase()} schedule-${item.state.toLowerCase()} weight-${item.weight.toLowerCase()}`}>
      <div className="schedule-time"><strong>{item.time}</strong><span>{item.endTime}</span></div>
      <div className="schedule-rail"><span className="schedule-node" /><span className="schedule-line" /></div>
      <div className="schedule-block">
        <div className="schedule-title-row"><div><span className="schedule-category">{item.category}</span><h3>{item.title}</h3></div><span className="commitment">{item.commitment}</span></div>
        <p>{item.detail}</p>
        {item.state === "PAST" && <span className="state-note"><Icon name="check" size={14} /> Recorded as complete in sample state</span>}
        {item.state === "NEXT" && <span className="state-note state-next">NEXT</span>}
      </div>
      {item.gapAfter && <div className="schedule-gap"><span>{item.gapAfter}</span></div>}
    </div>
  );
}

function EvidencePath({ stages }: { stages: EvidenceStage[] }) {
  return (
    <div className="evidence-path" aria-label="Evidence maturity">
      {stages.map((stage, index) => (
        <div className={`evidence-stage stage-${stage.state.toLowerCase()}`} key={stage.label}>
          <div className="stage-track"><span className="stage-dot">{stage.state === "COMPLETE" ? <Icon name="check" size={12} /> : index + 1}</span>{index < stages.length - 1 && <span className="stage-line" />}</div>
          <span className="stage-label">{stage.label}</span>
        </div>
      ))}
    </div>
  );
}

function BottomNavigation() {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {navItems.slice(0, 2).map((item) => <NavButton item={item} key={item.label} />)}
      <button className="capture-button" disabled aria-label="Capture — persistence coming next"><Icon name="plus" size={26} /><span>Capture</span></button>
      {navItems.slice(2).map((item) => <NavButton item={item} key={item.label} />)}
    </nav>
  );
}

function NavButton({ item }: { item: NavItem }) {
  return <button className={`nav-button ${item.active ? "active" : ""}`} disabled={!item.active} aria-current={item.active ? "page" : undefined}><Icon name={item.icon} size={19} /><span>{item.label}</span></button>;
}

function DesktopNavigation() {
  return (
    <aside className="desktop-nav" aria-label="Primary navigation">
      <div className="desktop-brand"><span>LO</span><small>PRIVATE</small></div>
      <div className="desktop-links">{navItems.map((item) => <NavButton item={item} key={item.label} />)}</div>
      <button className="desktop-capture" disabled><Icon name="plus" size={21} /><span>Capture</span></button>
    </aside>
  );
}

export function TodayDashboard({ model }: { model: TodayViewModel }) {
  return (
    <div className="life-app">
      <DesktopNavigation />
      <main className="today-canvas">
        <header className="app-header">
          <div className="wordmark">LIFE <span>/</span> OS</div>
          <div className="header-right"><span className="privacy-dot" />PRIVATE · SAMPLE STATE</div>
        </header>

        {model.demoMode && (
          <details className="prototype-note">
            <summary>Design prototype · no real writes yet <span>Details</span></summary>
            <p>This screen uses explicit sample state. Capture, navigation, AI, and session actions remain disabled until their persistence and event trail exist.</p>
          </details>
        )}

        <section className="orientation-section">
          <div className="date-line"><span>{model.dateLabel}</span><span>{model.dayPart}</span></div>
          <h1>{model.heading}</h1>
          <p className="orientation-copy">{model.orientation}</p>
          <div className="state-stamp"><span>{model.stateLabel}</span><i /></div>

          <div className="compass-strip">
            <div className="compass-icon"><Icon name="compass" size={28} /></div>
            <div className="compass-copy"><span className="micro-label">NORTH STAR</span><strong>{model.direction.title}</strong><p>{model.direction.statement}</p></div>
            <Provenance source={model.direction.source} />
          </div>
        </section>

        <section className="day-section">
          <div className="section-title-row"><div><span className="micro-label">THE SHAPE OF TODAY</span><h2>Day map</h2></div><div className="sample-clock"><span>sample now</span><strong>{model.day.sampleClock}</strong></div></div>

          <div className="moment-strip" aria-label="Now next later">
            <div><span>NOW</span><strong>Work ending</strong></div>
            <div className="moment-active"><span>NEXT</span><strong>Gym · 18:30</strong></div>
            <div><span>LATER</span><strong>Sound · 20:15</strong></div>
          </div>

          <div className="day-map">
            <div className="now-marker"><span>NOW</span><i /></div>
            {model.day.items.map((item) => <ScheduleItem item={item} key={item.id} />)}
          </div>
          <Provenance source={model.day.source} />
        </section>

        <section className="focus-section">
          <div className="section-title-row compact"><div><span className="micro-label">DELIBERATE FOCUS</span><h2>Only what deserves a place today.</h2></div></div>
          <div className="focus-list">
            {model.focus.map((item, index) => (
              <div className={`focus-row focus-${item.state.toLowerCase()}`} key={item.id}>
                <span className="focus-index">0{index + 1}</span>
                <div><strong>{item.label}</strong><span>{item.reason}</span></div>
                <span className="focus-state">{item.state === "DONE" ? "done" : item.state === "ACTIVE" ? "next" : "later"}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="craft-section">
          <div className="craft-heading"><div><span className="micro-label">JOURNEY · {model.creator.journey.toUpperCase()}</span><h2>{model.creator.skill}</h2></div><Provenance source={model.creator.source} /></div>
          <div className="craft-focus"><span>{model.creator.phase}</span><strong>{model.creator.technique}</strong><p>{model.creator.intent}</p></div>

          <div className="evidence-heading"><span className="micro-label">EVIDENCE PATH</span><span>No mastery percentage</span></div>
          <EvidencePath stages={model.creator.evidenceStages} />

          <div className="evidence-counts">
            <div><strong>{model.creator.evidenceCounts.practices}</strong><span>practice sessions</span></div>
            <div><strong>{model.creator.evidenceCounts.reels}</strong><span>reels applied</span></div>
            <div><strong>{model.creator.evidenceCounts.learnings}</strong><span>learnings kept</span></div>
          </div>

          <div className="learning-note"><span className="micro-label">LATEST LEARNING</span><p>“{model.creator.latestLearning}”</p></div>
          <div className="next-experiment"><div><span className="micro-label">NEXT EXPERIMENT</span><p>{model.creator.nextExperiment}</p></div><button disabled>Start practice <span>→</span></button></div>
        </section>

        <aside className="suggestion-note">
          <div className="suggestion-mark"><Icon name="spark" size={20} /></div>
          <div><TrustTag kind="SUGGESTION" /><h2>{model.suggestion.title}</h2><p>{model.suggestion.body}</p><details><summary>Why this suggestion?</summary><p>{model.suggestion.basis}</p></details></div>
          <Provenance source={model.suggestion.source} />
        </aside>

        <section className="review-section">
          <span className="micro-label">{model.review.label}</span>
          <h2>{model.review.title}</h2>
          <p>{model.review.prompt}</p>
          <button disabled>Open evening review <span>→</span></button>
        </section>

        <footer className="page-footer"><span>Life OS · Design V2</span><span>Sample data · explicit provenance · no hidden writes</span></footer>
      </main>
      <BottomNavigation />
    </div>
  );
}
