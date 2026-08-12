import Link from "next/link";
import type { JourneyTechnique, JourneyViewModel, TechniqueEvidence } from "../lib/journey-types";
import type { SourceRef, TrustClass } from "../lib/types";
import styles from "./journey-dashboard.module.css";

type IconName = "today" | "journey" | "calendar" | "memory" | "you" | "plus" | "arrow" | "check" | "lock" | "spark" | "play";

type NavItem = { label: string; icon: IconName; href?: string; active: boolean };

const navItems: NavItem[] = [
  { label: "Today", icon: "today", href: "/", active: false },
  { label: "Journey", icon: "journey", href: "/journey", active: true },
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
  if (name === "arrow") return <svg {...common}><path d="M5 12h14M14 7l5 5-5 5" /></svg>;
  if (name === "lock") return <svg {...common}><rect x="5" y="10" width="14" height="10" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
  if (name === "spark") return <svg {...common}><path d="M12 3c.7 4.3 2.4 6 6.5 6.5C14.4 10 12.7 11.7 12 16c-.7-4.3-2.4-6-6.5-6.5C9.6 9 11.3 7.3 12 3Z" /></svg>;
  if (name === "play") return <svg {...common}><path d="m8 5 11 7-11 7V5Z" /></svg>;
  return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;
}

function TrustTag({ kind }: { kind: TrustClass }) {
  return <span className={`trust-tag trust-${kind.toLowerCase()}`}>{trustLabels[kind]}</span>;
}

function Provenance({ source }: { source: SourceRef }) {
  return (
    <details className={`source-disclosure ${styles.source}`}>
      <summary><TrustTag kind={source.trustClass} /><span className="source-word">source</span></summary>
      <div className="source-panel"><strong>{source.label}</strong><span>{source.detail}</span><span>{source.recordedAt}</span></div>
    </details>
  );
}

function NavButton({ item }: { item: NavItem }) {
  const contents = <><Icon name={item.icon} size={20} /><span>{item.label}</span></>;
  if (item.href) {
    return <Link href={item.href} className={`nav-button ${styles.navLink} ${item.active ? "active" : ""}`} aria-current={item.active ? "page" : undefined}>{contents}</Link>;
  }
  return <button className="nav-button" disabled>{contents}</button>;
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

function RouteInstrument({ model }: { model: JourneyViewModel }) {
  return (
    <div className={styles.routeInstrument}>
      <div className={styles.routeTopline}><span>CAPABILITY ROUTE</span><span>ONE ACTIVE PHASE</span></div>
      <div className={styles.routeTrack}>
        {model.journey.phases.map((phase, index) => (
          <div className={`${styles.routePhase} ${styles[`route${phase.state}`]}`} key={phase.id}>
            <div className={styles.routeNode}>{phase.state === "ACTIVE" ? <span /> : <Icon name="lock" size={13} />}</div>
            <div className={styles.routeCopy}><span>{phase.index}</span><strong>{phase.shortLabel}</strong></div>
            {index < model.journey.phases.length - 1 && <i className={styles.routeLine} />}
          </div>
        ))}
      </div>
      <div className={styles.activePhaseReadout}>
        <div><span>{model.activeSkill.phaseLabel}</span><strong>{model.activeSkill.title}</strong></div>
        <p>{model.activeSkill.intent}</p>
      </div>
      <div className={styles.activeTechniqueReadout}>
        <span>ACTIVE EXPERIMENT</span>
        <strong>{model.activeSkill.activeTechnique.label}</strong>
        <p>{model.activeSkill.activeTechnique.cue}</p>
      </div>
    </div>
  );
}

function EvidenceInstrument({ evidence }: { evidence: TechniqueEvidence[] }) {
  return (
    <div className={styles.evidenceInstrument} aria-label="Evidence maturity for active technique">
      {evidence.map((stage, index) => (
        <div className={`${styles.evidenceStage} ${styles[`evidence${stage.state}`]}`} key={stage.label}>
          <div className={styles.evidenceRail}>
            <span className={styles.evidenceNode}>{stage.state === "COMPLETE" ? <Icon name="check" size={12} /> : index + 1}</span>
            {index < evidence.length - 1 && <i />}
          </div>
          <strong>{stage.label}</strong>
          <div className={styles.evidenceMarks} aria-label={`${stage.marks} evidence marks`}>
            {Array.from({ length: Math.max(stage.marks, 1) }).map((_, markIndex) => <span className={stage.marks === 0 ? styles.emptyMark : ""} key={markIndex} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function TechniqueNode({ technique }: { technique: JourneyTechnique }) {
  return (
    <div className={`${styles.techniqueNode} ${technique.state === "ACTIVE" ? styles.techniqueActive : ""}`}>
      <span>{technique.cue}</span>
      <strong>{technique.label}</strong>
      <small>{technique.state === "ACTIVE" ? "ACTIVE" : "AVAILABLE"}</small>
    </div>
  );
}

export function JourneyDashboard({ model }: { model: JourneyViewModel }) {
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
            <summary>Journey prototype <span>evidence is sample state</span></summary>
            <p>Navigation is real. Practice, skill, reel, and learning mutations remain disabled until canonical persistence and domain events exist.</p>
          </details>
        )}

        <section className={styles.hero}>
          <div className={styles.heroMeta}><span>JOURNEY / 01</span><strong>BUILD CAPABILITY, NOT STREAKS</strong></div>
          <div className={styles.heroHeading}>
            <div><span className="section-kicker">CURRENT JOURNEY</span><h1>{model.journey.title}</h1></div>
            <p>{model.journey.statement}</p>
          </div>
          <Provenance source={model.journey.source} />
          <RouteInstrument model={model} />
        </section>

        <section className={styles.capabilitySection}>
          <div className={styles.sectionHeading}>
            <div><span className="section-kicker">ACTIVE CAPABILITY / 01</span><h2>Sound is the work now.</h2></div>
            <p>Future skills stay visible for orientation. They do not compete for attention until the active phase changes by decision.</p>
          </div>

          <div className={styles.capabilityGrid}>
            <div className={styles.evidencePanel}>
              <div className={styles.panelTopline}><span>EVIDENCE DEPTH</span><strong>REVIEW → REPEAT</strong></div>
              <EvidenceInstrument evidence={model.activeSkill.evidence} />
              <div className={styles.evidenceCounts}>
                <div><strong>{model.activeSkill.evidenceCounts.sessions.toString().padStart(2, "0")}</strong><span>sessions</span></div>
                <div><strong>{model.activeSkill.evidenceCounts.reels.toString().padStart(2, "0")}</strong><span>reels</span></div>
                <div><strong>{model.activeSkill.evidenceCounts.learnings.toString().padStart(2, "0")}</strong><span>learnings</span></div>
                <div><strong>{model.activeSkill.evidenceCounts.reviews.toString().padStart(2, "0")}</strong><span>reviews</span></div>
              </div>
            </div>

            <div className={styles.techniqueField}>
              <div className={styles.fieldGrid} aria-hidden="true" />
              <div className={styles.fieldHeading}><span>TECHNIQUE FIELD</span><strong>One technique is active.</strong></div>
              <div className={styles.techniqueNodes}>{model.activeSkill.techniques.map((technique) => <TechniqueNode technique={technique} key={technique.id} />)}</div>
            </div>
          </div>
        </section>

        <section className={styles.practiceSection}>
          <div className={styles.sectionHeading}>
            <div><span className="section-kicker">PRACTICE CHRONOLOGY</span><h2>Field log</h2></div>
            <p>Chronology replaces streaks. Each session should leave evidence or a retained learning.</p>
          </div>
          <div className={styles.filmStrip}>
            {model.practices.map((practice) => (
              <article className={styles.practiceFrame} key={practice.id}>
                <div className={styles.frameHead}><span>{practice.number}</span><strong>{practice.date}</strong></div>
                <div className={styles.frameWindow}><span>EXPERIMENT</span><strong>{practice.experiment}</strong><small>{practice.duration}</small></div>
                <p>{practice.learning}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.reelSection}>
          <div className={styles.sectionHeading}>
            <div><span className="section-kicker">APPLICATION EVIDENCE</span><h2>Reels that carried the technique</h2></div>
            <p>A reel matters here because it tested the technique inside a real production artifact.</p>
          </div>
          <div className={styles.reelGrid}>
            {model.reels.map((reel, index) => (
              <article className={styles.reelItem} key={reel.id}>
                <div className={styles.reelFrame}>
                  <div className={styles.reelNoise} />
                  <span>{reel.code}</span>
                  <strong>0{index + 1}</strong>
                  <div className={styles.reelPlay}><Icon name="play" size={17} /></div>
                </div>
                <div className={styles.reelMeta}><span>{reel.stage}</span><strong>{reel.title}</strong><p>{reel.technique}</p></div>
                <div className={styles.reviewSplit}>
                  <span>YOU · {reel.personalReview}</span>
                  <span>EXTERNAL · {reel.externalAnalysis.replace("_", " ")}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.learningSection}>
          <div className={styles.sectionHeading}>
            <div><span className="section-kicker">RETAINED MEMORY</span><h2>What the work taught you</h2></div>
            <p>Only retained learnings appear here. Raw notes belong in history, not in the capability truth layer.</p>
          </div>
          <div className={styles.learningLedger}>
            {model.learnings.map((learning, index) => (
              <article className={styles.learningRow} key={learning.id}>
                <span className={styles.learningIndex}>L/{String(index + 1).padStart(2, "0")}</span>
                <div><p>{learning.text}</p><span>{learning.evidence}</span></div>
                <Provenance source={learning.source} />
              </article>
            ))}
          </div>

          <aside className={styles.externalObservation}>
            <div><Icon name="spark" size={19} /><TrustTag kind="OBSERVATION" /></div>
            <div><strong>{model.externalObservation.title}</strong><p>{model.externalObservation.body}</p></div>
            <Provenance source={model.externalObservation.source} />
          </aside>
        </section>

        <section className={styles.nextSection}>
          <div className={styles.nextSignal}><span>NEXT / ONE EXPERIMENT</span><i /></div>
          <div className={styles.nextGrid}>
            <div><h2>{model.nextExperiment.title}</h2><p>{model.nextExperiment.instruction}</p></div>
            <div className={styles.nextReason}><span>WHY THIS</span><p>{model.nextExperiment.reason}</p><button disabled>Start practice <Icon name="arrow" size={18} /></button></div>
          </div>
        </section>

        <footer className={styles.footer}><span>Life OS / Journey V1</span><span>sample evidence · focus protected · writes disabled</span></footer>
      </main>
    </div>
  );
}
