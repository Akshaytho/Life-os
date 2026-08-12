import Link from "next/link";
import type { JourneyViewModel } from "../lib/journey-types";
import styles from "./journey-overview.module.css";

type IconName = "today" | "journey" | "calendar" | "memory" | "you" | "plus" | "arrow" | "lock" | "check";
type NavItem = { label: string; icon: IconName; href?: string; active?: boolean };

const navItems: NavItem[] = [
  { label: "Today", icon: "today", href: "/" },
  { label: "Journey", icon: "journey", href: "/journey", active: true },
  { label: "Calendar", icon: "calendar" },
  { label: "Memory", icon: "memory" },
  { label: "You", icon: "you" },
];

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "today") return <svg {...common}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M22 12h-3M12 22v-3M2 12h3" /></svg>;
  if (name === "journey") return <svg {...common}><path d="M4 18c4-8 7-11 16-13" /><circle cx="5" cy="18" r="2" /><path d="m16 4 4 1-1 4" /></svg>;
  if (name === "calendar") return <svg {...common}><path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z" /><path d="M7 2v4M17 2v4M3 9h18" /></svg>;
  if (name === "memory") return <svg {...common}><path d="M6 3h10a3 3 0 0 1 3 3v15H8a3 3 0 0 1-3-3V4a1 1 0 0 1 1-1Z" /><path d="M8 21a3 3 0 0 1 0-6h11M9 8h6M9 11h4" /></svg>;
  if (name === "you") return <svg {...common}><circle cx="12" cy="8" r="3" /><path d="M5.5 20c.8-4.1 3-6.1 6.5-6.1s5.7 2 6.5 6.1" /></svg>;
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === "arrow") return <svg {...common}><path d="M5 12h14M14 7l5 5-5 5" /></svg>;
  if (name === "lock") return <svg {...common}><rect x="5" y="10" width="14" height="10" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
  return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;
}

function NavButton({ item }: { item: NavItem }) {
  const content = <><Icon name={item.icon} size={20} /><span>{item.label}</span></>;
  if (item.href) return <Link href={item.href} className={`nav-button ${styles.navLink} ${item.active ? "active" : ""}`} aria-current={item.active ? "page" : undefined}>{content}</Link>;
  return <button className="nav-button" disabled>{content}</button>;
}

function AppNavigation() {
  return (
    <>
      <aside className="desktop-nav" aria-label="Primary navigation">
        <div className="desktop-brand"><span>L/O</span><small>PRIVATE</small></div>
        <div className="desktop-links">{navItems.map((item) => <NavButton item={item} key={item.label} />)}</div>
        <button className="desktop-capture" disabled><Icon name="plus" size={22} /><span>Capture</span></button>
      </aside>
      <nav className="bottom-nav" aria-label="Primary navigation">{navItems.map((item) => <NavButton item={item} key={item.label} />)}</nav>
      <button className="floating-capture" disabled aria-label="Capture"><Icon name="plus" size={25} /><span>Capture</span></button>
    </>
  );
}

export function JourneyOverview({ model }: { model: JourneyViewModel }) {
  const activePhase = model.journey.phases.find((phase) => phase.state === "ACTIVE") ?? model.journey.phases[0];
  const latestPractice = model.practices[0];
  const latestLearning = model.learnings[0];

  return (
    <div className="life-app">
      <AppNavigation />
      <main className={styles.canvas}>
        <header className="system-bar">
          <div className="wordmark">LIFE<span>/</span>OS</div>
          <div className="system-state"><i />PRIVATE · SAMPLE</div>
        </header>

        {model.demoMode && (
          <details className="prototype-note">
            <summary>Journey overview <span>sample state only</span></summary>
            <p>This is a read-only prototype. Journey activation, practice, learning, reel, and decision writes remain disabled until canonical persistence and domain events exist.</p>
          </details>
        )}

        <section className={styles.hero}>
          <span className="section-kicker">BECOMING / ACTIVE JOURNEY</span>
          <h1>{model.journey.title}</h1>
          <p>{model.journey.statement}</p>
          <div className={styles.decisionLine}><span>DECISION</span><strong>{model.journey.source.recordedAt}</strong></div>
        </section>

        <section className={styles.nowSection}>
          <div className={styles.nowTopline}><span>NOW</span><strong>ONE ACTIVE CAPABILITY</strong></div>
          <div className={styles.capabilityGrid}>
            <div className={styles.phaseIndex}>{activePhase.index}</div>
            <div className={styles.capabilityCopy}>
              <span>{activePhase.label.toUpperCase()}</span>
              <h2>{model.activeSkill.activeTechnique.label}</h2>
              <p>{model.activeSkill.activeTechnique.cue}</p>
            </div>
          </div>

          <div className={styles.edgeRow}>
            <div><span>CURRENT EDGE</span><strong>Review → repeat</strong></div>
            <div className={styles.evidenceDots} aria-label="Evidence maturity">
              {model.activeSkill.evidence.map((stage) => <i key={stage.label} data-state={stage.state} title={stage.label} />)}
            </div>
          </div>

          <div className={styles.nextExperiment}>
            <span>NEXT EXPERIMENT</span>
            <strong>{model.nextExperiment.title}</strong>
            <p>{model.nextExperiment.instruction}</p>
          </div>

          <Link href="/journey/travel-creator/sound-design" className={styles.openCapability}>
            <span>Open Sound Design</span><Icon name="arrow" size={18} />
          </Link>
        </section>

        <section className={styles.recentSection}>
          <div className={styles.sectionHeading}><div><span className="section-kicker">RECENT / MEANINGFUL ONLY</span><h2>Evidence that moved</h2></div><p>Journey compresses activity. Detailed chronology lives inside the capability.</p></div>

          <div className={styles.evidenceSummary}>
            <div><strong>{model.activeSkill.evidenceCounts.sessions.toString().padStart(2, "0")}</strong><span>practice sessions</span></div>
            <div><strong>{model.activeSkill.evidenceCounts.reels.toString().padStart(2, "0")}</strong><span>applied reels</span></div>
            <div><strong>{model.activeSkill.evidenceCounts.learnings.toString().padStart(2, "0")}</strong><span>retained learnings</span></div>
          </div>

          <div className={styles.movementLedger}>
            <article>
              <span>LATEST MOVEMENT</span>
              <strong>{latestPractice.date} · {latestPractice.experiment}</strong>
              <p>{latestPractice.learning}</p>
            </article>
            <article>
              <span>RETAINED LEARNING</span>
              <strong>{latestLearning.evidence}</strong>
              <p>{latestLearning.text}</p>
            </article>
          </div>
        </section>

        <section className={styles.arcSection}>
          <div className={styles.sectionHeading}><div><span className="section-kicker">ARC / MONTHS & YEARS</span><h2>The capability route</h2></div><p>Future phases are orientation, not commitments. Only an explicit decision activates one.</p></div>

          <div className={styles.arcRoute}>
            {model.journey.phases.map((phase, index) => (
              <div className={`${styles.arcPhase} ${phase.state === "ACTIVE" ? styles.arcActive : ""}`} key={phase.id}>
                <div className={styles.arcRail}>
                  <span>{phase.state === "ACTIVE" ? <i /> : <Icon name="lock" size={12} />}</span>
                  {index < model.journey.phases.length - 1 && <b />}
                </div>
                <div className={styles.arcCopy}><small>{phase.index}</small><strong>{phase.label}</strong><span>{phase.state === "ACTIVE" ? "ACTIVE NOW" : "FUTURE / QUIET"}</span></div>
              </div>
            ))}
          </div>
        </section>

        <aside className={styles.scopeNote}>
          <span>JOURNEY STAYS SELECTIVE</span>
          <p>Friends, work, appointments, health, rest, travel, hard weeks, and everyday life do not get dumped here. Calendar, Memory, Reviews, and Today carry those truths. Journey keeps only evidence relevant to deliberate becoming.</p>
        </aside>

        <footer className="page-footer"><span>Life OS / Journey hierarchy V2</span><span>overview → capability detail · sample state</span></footer>
      </main>
    </div>
  );
}
