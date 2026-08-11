import type { CalendarPreviewItem, SourceRef, TodayViewModel, TrustClass } from "../lib/types";

const navItems = [
  { label: "Today", glyph: "●", active: true },
  { label: "Journey", glyph: "↗" },
  { label: "Calendar", glyph: "□" },
  { label: "Memory", glyph: "⌁" },
  { label: "You", glyph: "○" },
] as const;

const trustLabels: Record<TrustClass, string> = {
  FACT: "FACT",
  REFLECTION: "YOUR REFLECTION",
  OBSERVATION: "OBSERVATION",
  SUGGESTION: "SUGGESTION",
  DECISION: "YOUR DECISION",
};

function TrustMark({ kind }: { kind: TrustClass }) {
  return <span className={`trust-mark trust-${kind.toLowerCase()}`}>{trustLabels[kind]}</span>;
}

function Provenance({ source, compact = false }: { source: SourceRef; compact?: boolean }) {
  return (
    <details className={`provenance ${compact ? "provenance-compact" : ""}`}>
      <summary>
        <TrustMark kind={source.trustClass} />
        <span className="provenance-label">{source.label}</span>
        <span className="chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="provenance-detail">
        <span>{source.detail}</span>
        <span>{source.recordedAt}</span>
      </div>
    </details>
  );
}

function CalendarRow({ item, last }: { item: CalendarPreviewItem; last: boolean }) {
  return (
    <div className={`timeline-row ${last ? "timeline-row-last" : ""}`}>
      <div className="time-column">
        <span>{item.time}</span>
        <small>{item.endTime}</small>
      </div>
      <div className="timeline-rail" aria-hidden="true">
        <span className={`timeline-dot dot-${item.category.toLowerCase()}`} />
        {!last && <span className="timeline-line" />}
      </div>
      <div className="timeline-content">
        <div className="timeline-title-row">
          <h3>{item.title}</h3>
          {item.completed && <span className="done-mark">Done</span>}
        </div>
        <p>{item.detail}</p>
        <div className="timeline-meta">
          <span>{item.commitment.toLowerCase()}</span>
          <span>recorded commitment</span>
        </div>
      </div>
    </div>
  );
}

function AppNavigation() {
  return (
    <>
      <aside className="desktop-rail" aria-label="Primary navigation">
        <div className="brand-mark" aria-label="Life OS">L/O</div>
        <nav>
          {navItems.map((item) => (
            <button key={item.label} className={item.active ? "rail-item active" : "rail-item"} disabled={!item.active} aria-current={item.active ? "page" : undefined}>
              <span className="rail-glyph" aria-hidden="true">{item.glyph}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-foot">PRIVATE<br />SYSTEM</div>
      </aside>

      <nav className="mobile-nav" aria-label="Primary navigation">
        {navItems.map((item) => (
          <button key={item.label} className={item.active ? "mobile-nav-item active" : "mobile-nav-item"} disabled={!item.active} aria-current={item.active ? "page" : undefined}>
            <span aria-hidden="true">{item.glyph}</span>
            <small>{item.label}</small>
          </button>
        ))}
      </nav>
    </>
  );
}

export function TodayDashboard({ model }: { model: TodayViewModel }) {
  return (
    <div className="app-frame">
      <AppNavigation />

      <main className="today-shell">
        <header className="topbar">
          <div className="mobile-brand">LIFE / OS</div>
          <div className="topbar-status">
            <span className="status-dot" aria-hidden="true" />
            <span>Prototype data</span>
          </div>
          <button className="ghost-action" disabled title="AI chat arrives after the core data model is wired">Ask Life OS</button>
        </header>

        {model.demoMode && (
          <div className="trust-banner" role="note">
            <div>
              <span className="eyebrow">TRUST STATE</span>
              <strong>Nothing on this screen writes to your Life OS yet.</strong>
            </div>
            <p>Every item below is explicit sample data. We will connect real state only after the persistence and event trail are in place.</p>
          </div>
        )}

        <section className="hero-grid">
          <div className="date-lockup" aria-label={model.dateLabel}>
            <span>{model.monthLabel}</span>
            <strong>{model.dayNumber}</strong>
          </div>
          <div className="hero-copy">
            <p className="eyebrow">{model.dateLabel.toUpperCase()}</p>
            <h1>{model.greeting}</h1>
            <p className="orientation">{model.orientation}</p>
          </div>
        </section>

        <section className="direction-card editorial-card">
          <div className="card-kicker-row">
            <span className="eyebrow">{model.direction.eyebrow}</span>
            <Provenance source={model.direction.source} compact />
          </div>
          <h2>{model.direction.title}</h2>
          <p>{model.direction.statement}</p>
          <div className="direction-rule" aria-hidden="true" />
          <div className="direction-note">
            <span>North star</span>
            <span>Direction over daily perfection.</span>
          </div>
        </section>

        <div className="content-grid">
          <section className="schedule-card editorial-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">TODAY'S REALITY</span>
                <h2>Three commitments.</h2>
              </div>
              <span className="section-aside">1 flexible</span>
            </div>

            <div className="timeline">
              {model.calendar.map((item, index) => (
                <CalendarRow key={item.id} item={item} last={index === model.calendar.length - 1} />
              ))}
            </div>

            <div className="context-note">
              <TrustMark kind="FACT" />
              <p>The calendar describes reality. It does not score your worth or productivity.</p>
            </div>
          </section>

          <section className="creator-card editorial-card">
            <div className="creator-orbit" aria-hidden="true">
              <span />
              <span />
            </div>
            <div className="card-kicker-row">
              <span className="eyebrow">CURRENT JOURNEY · {model.creator.phase}</span>
              <Provenance source={model.creator.source} compact />
            </div>
            <div className="creator-index">01</div>
            <h2>{model.creator.skill}</h2>
            <p className="creator-focus-label">TODAY'S EXPERIMENT</p>
            <h3>{model.creator.focus}</h3>
            <p className="creator-intent">{model.creator.intent}</p>

            <div className="evidence-row" aria-label="Skill evidence">
              <div><strong>{model.creator.evidence.practices}</strong><span>practices</span></div>
              <div><strong>{model.creator.evidence.reels}</strong><span>reels</span></div>
              <div><strong>{model.creator.evidence.learnings}</strong><span>learnings</span></div>
            </div>

            <button className="primary-action" disabled>
              <span>Start 35 min practice</span>
              <span aria-hidden="true">→</span>
            </button>
            <p className="disabled-note">Session persistence is the next implementation step.</p>
          </section>
        </div>

        <section className="suggestion-card">
          <div className="suggestion-number" aria-hidden="true">01</div>
          <div className="suggestion-copy">
            <TrustMark kind="SUGGESTION" />
            <h2>{model.suggestion.title}</h2>
            <p>{model.suggestion.body}</p>
            <details className="basis-details">
              <summary>Why am I seeing this?</summary>
              <p>{model.suggestion.basis}</p>
            </details>
          </div>
          <Provenance source={model.suggestion.source} />
        </section>

        <section className="quick-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">WHEN YOUR HEAD GETS LOUD</span>
              <h2>Capture first. Organize later.</h2>
            </div>
          </div>
          <div className="quick-grid">
            <button className="quick-action" disabled>
              <span className="quick-symbol">＋</span>
              <strong>Brain Dump</strong>
              <small>Get it out of your head.</small>
              <em>Coming next</em>
            </button>
            <button className="quick-action drift-action" disabled>
              <span className="quick-symbol">↺</span>
              <strong>I'm Drifting</strong>
              <small>Record what is pulling you away.</small>
              <em>Coming next</em>
            </button>
          </div>
        </section>

        <footer className="today-footer">
          <span>LIFE OS / FIRST USABLE SLICE</span>
          <span>Sample state · No AI writes · No hidden persistence</span>
        </footer>
      </main>
    </div>
  );
}
