import Link from "next/link";
import type {
  DerivedPattern,
  MeaningfulMemory,
  MemoryAnchor,
  MemoryAuthority,
  MemorySourceRef,
  MemoryViewModel,
} from "../lib/memory-types";
import styles from "./memory-overview.module.css";

function ArrowIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}

function SearchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function Authority({ value }: { value: MemoryAuthority }) {
  return <span className={styles.authority} data-authority={value}>{value}</span>;
}

function SourceDisclosure({ source }: { source: MemorySourceRef }) {
  return (
    <details className={styles.source}>
      <summary>PROVENANCE</summary>
      <div>
        <strong>{source.label}</strong>
        {source.detail && <span>{source.detail}</span>}
        <span>{source.recordedAt}</span>
      </div>
    </details>
  );
}

function Anchor({ anchor, index }: { anchor: MemoryAnchor; index: number }) {
  const body = (
    <>
      <div className={styles.anchorIndex}>{String(index + 1).padStart(2, "0")}</div>
      <div className={styles.anchorBody}>
        <div className={styles.anchorTopline}>
          <span>{anchor.label}</span>
          <span className={styles.owner}>OWNER · {anchor.owner}</span>
        </div>
        <h3>{anchor.value}</h3>
        <p>{anchor.detail}</p>
        <div className={styles.anchorFooter}>
          <Authority value={anchor.authority} />
          <SourceDisclosure source={anchor.source} />
        </div>
      </div>
      {anchor.href && <span className={styles.anchorArrow}><ArrowIcon /></span>}
    </>
  );

  if (anchor.href) return <Link href={anchor.href} className={styles.anchor}>{body}</Link>;
  return <article className={styles.anchor}>{body}</article>;
}

function MemoryItem({ item, index }: { item: MeaningfulMemory; index: number }) {
  return (
    <article className={styles.memoryItem}>
      <div className={styles.memoryDate}>
        <span>{item.date}</span>
        <small>{String(index + 1).padStart(2, "0")}</small>
      </div>
      <div className={styles.memoryBody}>
        <div className={styles.memoryMeta}><span>{item.kind}</span><Authority value={item.authority} /></div>
        <h3>{item.title}</h3>
        <p>{item.summary}</p>
        <SourceDisclosure source={item.source} />
      </div>
    </article>
  );
}

function Pattern({ item, index }: { item: DerivedPattern; index: number }) {
  return (
    <article className={styles.pattern}>
      <div className={styles.patternNumber}>{String(index + 1).padStart(2, "0")}</div>
      <div className={styles.patternCopy}>
        <div className={styles.patternTopline}>
          <Authority value={item.authority} />
          <span>{item.evidenceWindow} · {item.evidence}</span>
        </div>
        <h3>{item.title}</h3>
        <p>{item.statement}</p>
        <SourceDisclosure source={item.source} />
      </div>
    </article>
  );
}

export function MemoryOverview({ model }: { model: MemoryViewModel }) {
  return (
    <div className="life-app">
      <main className={styles.canvas}>
        <header className="system-bar">
          <div className="wordmark">LIFE<span>/</span>OS</div>
          <div className="system-state"><i />PRIVATE · SAMPLE</div>
        </header>

        {model.demoMode && (
          <details className="prototype-note">
            <summary>Memory overview <span>synthetic sample only</span></summary>
            <p>Recall, semantic retrieval, promotion, deletion and source drill-down are not connected. The screen is testing long-term information hierarchy with fake data only.</p>
          </details>
        )}

        <section className={styles.hero}>
          <div className={styles.heroTopline}><span>MEMORY / RECALL</span><span>TRUST BEFORE RECENCY</span></div>
          <div className={styles.heroGrid}>
            <div>
              <span className="section-kicker">REMEMBER WITHOUT FLATTENING HISTORY</span>
              <h1>Find the right memory.<br />Know what it means.</h1>
            </div>
            <p>Memory preserves depth without treating every old sentence as truth. Current decisions, lived evidence, reflections and derived patterns stay distinguishable as time accumulates.</p>
          </div>
        </section>

        <section className={styles.recall} aria-label="Memory recall prototype">
          <div className={styles.recallTopline}>
            <span>RECALL / ASK MEMORY</span>
            <span>NOT CONNECTED</span>
          </div>
          <div className={styles.recallQuestion}>
            <SearchIcon size={20} />
            <div>
              <small>SAMPLE QUESTION</small>
              <strong>{model.recallPrompt}</strong>
            </div>
          </div>
          <p className={styles.recallExplanation}>{model.recallExplanation}</p>
          <div className={styles.depthRail} aria-label="Progressive memory depth">
            <div><span>01</span><strong>Glance</strong><small>trusted answer</small></div>
            <i />
            <div><span>02</span><strong>Summary</strong><small>why + evidence</small></div>
            <i />
            <div><span>03</span><strong>Source</strong><small>full context</small></div>
          </div>
          <button type="button" disabled>ASK MEMORY <ArrowIcon size={13} /></button>
        </section>

        <section className={styles.section} aria-labelledby="trusted-now-title">
          <div className={styles.sectionHeading}>
            <div><span>TRUSTED NOW</span><h2 id="trusted-now-title">A few anchors that should not be confused with newer noise.</h2></div>
            <p>These are references to canonical owners. Memory can retrieve them; it does not become their source of truth.</p>
          </div>
          <div className={styles.anchorStack}>{model.anchors.map((anchor, index) => <Anchor key={anchor.id} anchor={anchor} index={index} />)}</div>
        </section>

        <section className={`${styles.section} ${styles.evidenceSection}`} aria-labelledby="worth-keeping-title">
          <div className={styles.sectionHeading}>
            <div><span>WORTH KEEPING</span><h2 id="worth-keeping-title">History selected for future usefulness—not because it happened recently.</h2></div>
            <p>Meaningful evidence stays typed and sourced. Ordinary events can remain in their owning domains without flooding Memory.</p>
          </div>
          <div className={styles.memoryList}>{model.memories.map((item, index) => <MemoryItem key={item.id} item={item} index={index} />)}</div>
        </section>

        <section className={`${styles.section} ${styles.timeSection}`} aria-labelledby="time-memory-title">
          <div className={styles.sectionHeading}>
            <div><span>TIME MEMORY</span><h2 id="time-memory-title">Compress time before expanding it.</h2></div>
            <p>Long-range recall starts with month and week summaries, then opens day and source only when the question needs them.</p>
          </div>

          <div className={styles.monthInstrument}>
            <div className={styles.monthLead}>
              <div className={styles.monthTopline}><span>{model.month.label}</span><Authority value={model.month.authority} /></div>
              <h3>{model.month.title}</h3>
              <p>{model.month.summary}</p>
              <SourceDisclosure source={model.month.source} />
            </div>
            <div className={styles.weekStack}>
              {model.month.weeks.map((week, index) => (
                <article className={styles.week} data-empty={week.signals.length === 0 ? "true" : "false"} key={week.id}>
                  <div className={styles.weekIndex}><span>{String(index + 1).padStart(2, "0")}</span><small>{week.range}</small></div>
                  <div className={styles.weekCopy}>
                    <h4>{week.title}</h4>
                    <p>{week.summary}</p>
                    {week.signals.length > 0 && <div className={styles.signals}>{week.signals.map((signal) => <span key={signal}>{signal}</span>)}</div>}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className={styles.timeLadder} aria-label="Long range memory hierarchy">
            <span>YEAR</span><i /><strong>MONTH</strong><i /><span>WEEK</span><i /><span>DAY</span><i /><span>SOURCE</span>
          </div>
        </section>

        <section className={`${styles.section} ${styles.patternSection}`} aria-labelledby="patterns-title">
          <div className={styles.sectionHeading}>
            <div><span>DERIVED / LOWER AUTHORITY</span><h2 id="patterns-title">Patterns can help without becoming facts.</h2></div>
            <p>These are synthesized observations over evidence windows. They remain inspectable and never silently rewrite current state.</p>
          </div>
          <div className={styles.patternGrid}>{model.patterns.map((item, index) => <Pattern key={item.id} item={item} index={index} />)}</div>
        </section>

        <aside className={styles.ownershipNote}>
          <div className={styles.ownershipMark}>M</div>
          <div>
            <span>MEMORY REMEMBERS; OWNERS STILL OWN</span>
            <p>Direction remains in You. Time remains in Calendar. Capability remains in Journey. The Interaction & Change Ledger explains how Life OS actions produced changes. Memory makes the trustworthy context retrievable across all of them.</p>
          </div>
        </aside>

        <footer className="page-footer"><span>Life OS / Memory recall V1</span><span>artifact v1.2.0 · synthetic sample · read-only</span></footer>
      </main>
    </div>
  );
}
