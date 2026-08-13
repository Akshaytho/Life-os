import Link from "next/link";
import type {
  InteractionChangeTrace,
  InteractionProposalTrace,
  InteractionTraceStatus,
} from "../../../packages/contracts/interaction-change-ledger";
import styles from "./interaction-ledger-detail.module.css";

function ArrowIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}

function CheckIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" />
    </svg>
  );
}

function CloseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" />
    </svg>
  );
}

function formatMoment(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date).replace(",", " ·").toUpperCase();
}

function humanEnum(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function statusCopy(status: InteractionTraceStatus, canonicalCount: number) {
  if (status === "COMMITTED") return {
    label: "COMMITTED",
    title: canonicalCount === 1 ? "A canonical change was made." : `${canonicalCount} canonical changes were made.`,
    tone: "committed",
  };
  if (status === "CLOSED_NO_CHANGE") return {
    label: "CLOSED · NO CHANGE",
    title: "Nothing in your canonical life state changed.",
    tone: "closed",
  };
  if (status === "NEEDS_USER") return { label: "NEEDS YOU", title: "Life OS stopped before changing anything.", tone: "needs" };
  if (status === "READY_FOR_APPROVAL") return { label: "READY FOR REVIEW", title: "A proposal is waiting for your decision.", tone: "needs" };
  if (status === "PARTIALLY_COMMITTED") return { label: "PARTIAL", title: "Some consequences changed state; others are still open.", tone: "partial" };
  return { label: humanEnum(status).toUpperCase(), title: "This interaction has not reached a terminal result yet.", tone: "needs" };
}

function Authority({ children, kind }: { children: React.ReactNode; kind: string }) {
  return <span className={styles.authority} data-authority={kind}>{children}</span>;
}

function TraceCard({
  index,
  eyebrow,
  authority,
  authorityKind,
  title,
  children,
  meta,
}: {
  index: string;
  eyebrow: string;
  authority: string;
  authorityKind: string;
  title: string;
  children: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <article className={styles.traceCard} data-authority={authorityKind}>
      <div className={styles.traceIndex}>{index}</div>
      <div className={styles.traceBody}>
        <div className={styles.traceTopline}><span>{eyebrow}</span><Authority kind={authorityKind}>{authority}</Authority></div>
        <h3>{title}</h3>
        <div className={styles.traceContent}>{children}</div>
        {meta && <div className={styles.traceMeta}>{meta}</div>}
      </div>
    </article>
  );
}

function ProposalOutcome({ proposal, number }: { proposal: InteractionProposalTrace; number: number }) {
  const action = proposal.userAction;
  const change = proposal.canonicalChange;

  return (
    <section className={styles.consequence}>
      <div className={styles.consequenceHeading}>
        <span>CONSEQUENCE {String(number).padStart(2, "0")}</span>
        <strong>{proposal.destination}</strong>
      </div>

      <div className={styles.consequenceTrack}>
        <TraceCard
          index="03"
          eyebrow="LIFE OS PROPOSED"
          authority="SUGGESTION"
          authorityKind="SUGGESTION"
          title={proposal.summary}
          meta={<><span>{proposal.destination}</span><span>{humanEnum(proposal.operation)}</span><span>Would become · {proposal.proposedResultClass}</span></>}
        >
          <p>{proposal.reason}</p>
        </TraceCard>

        <div className={styles.connector} aria-hidden="true"><span /><ArrowIcon size={13} /></div>

        {action ? (
          <TraceCard
            index="04"
            eyebrow="YOU CHOSE"
            authority="DECISION"
            authorityKind="DECISION"
            title={action.action === "APPROVED" ? "Approved" : "Rejected"}
            meta={<><span>{formatMoment(action.at)}</span><span>actor · user</span></>}
          >
            <div className={styles.actionLine} data-action={action.action}>
              {action.action === "APPROVED" ? <CheckIcon /> : <CloseIcon />}
              <p>{action.reason ?? (action.action === "APPROVED" ? "You explicitly approved this consequence." : "You explicitly declined this consequence.")}</p>
            </div>
          </TraceCard>
        ) : (
          <TraceCard index="04" eyebrow="USER ACTION" authority="OPEN" authorityKind="OPEN" title="No terminal choice yet">
            <p>This proposal is still waiting for a user decision.</p>
          </TraceCard>
        )}

        <div className={styles.connector} aria-hidden="true"><span /><ArrowIcon size={13} /></div>

        {change ? (
          <TraceCard
            index="05"
            eyebrow={`${proposal.destination} CHANGED`}
            authority={change.resultClass}
            authorityKind={change.resultClass}
            title={change.summary}
            meta={<><span>{change.eventType}</span><span>{formatMoment(change.occurredAt)}</span></>}
          >
            {change.details && (
              <dl className={styles.changeDetails}>
                {Object.entries(change.details).map(([key, value]) => <div key={key}><dt>{humanEnum(key)}</dt><dd>{value}</dd></div>)}
              </dl>
            )}
          </TraceCard>
        ) : (
          <TraceCard
            index="05"
            eyebrow="CANONICAL RESULT"
            authority="NO WRITE"
            authorityKind="NO_WRITE"
            title="No canonical change"
            meta={<><span>0 domain events</span><span>{proposal.state}</span></>}
          >
            <p>The suggestion ended without changing Calendar, Journey, Memory, You or other canonical life state.</p>
          </TraceCard>
        )}
      </div>
    </section>
  );
}

export function InteractionLedgerDetail({ trace, sampleState }: { trace: InteractionChangeTrace; sampleState: "committed" | "rejected" }) {
  const canonicalChanges = trace.proposals.flatMap((proposal) => proposal.canonicalChange ? [proposal.canonicalChange] : []);
  const outcome = statusCopy(trace.status, canonicalChanges.length);
  const primaryChange = canonicalChanges[0];
  const lastAction = trace.proposals.map((proposal) => proposal.userAction).filter(Boolean).at(-1);

  return (
    <div className="life-app">
      <main className={styles.canvas}>
        <header className="system-bar">
          <div className="wordmark">LIFE<span>/</span>OS</div>
          <div className="system-state"><i />PRIVATE · SAMPLE</div>
        </header>

        <details className="prototype-note">
          <summary>Interaction & Change trace <span>synthetic sample only</span></summary>
          <p>This is a read-only visual projection over the existing trace contract. It does not call the private API, mutate state or retrieve technical telemetry.</p>
        </details>

        <section className={styles.hero}>
          <div className={styles.heroTopline}>
            <span>INTERACTION / CHANGE TRACE</span>
            <span>{formatMoment(trace.source.occurredAt)} UTC</span>
          </div>
          <div className={styles.sampleSwitch} aria-label="Synthetic trace examples">
            <Link href="/interactions/sample?state=committed" aria-current={sampleState === "committed" ? "page" : undefined}>COMMITTED</Link>
            <Link href="/interactions/sample?state=rejected" aria-current={sampleState === "rejected" ? "page" : undefined}>REJECTED / NO CHANGE</Link>
          </div>
        </section>

        <section className={styles.outcome} data-tone={outcome.tone} aria-label="Interaction outcome">
          <div className={styles.outcomeTopline}>
            <span>{outcome.label}</span>
            <span>{canonicalChanges.length} CANONICAL {canonicalChanges.length === 1 ? "CHANGE" : "CHANGES"}</span>
          </div>
          <div className={styles.outcomeGrid}>
            <div>
              <span className={styles.outcomeKicker}>WHAT HAPPENED</span>
              <h1>{outcome.title}</h1>
            </div>
            <div className={styles.outcomeSummary}>
              {primaryChange ? (
                <>
                  <strong>{primaryChange.summary}</strong>
                  <p>You approved the proposal, so the owning domain wrote canonical state and emitted a domain event.</p>
                </>
              ) : (
                <>
                  <strong>{lastAction?.action === "REJECTED" ? "You rejected the suggestion." : "No canonical event exists."}</strong>
                  <p>The interaction is complete without a life-state mutation. The original source and your decision remain inspectable.</p>
                </>
              )}
            </div>
          </div>
          <div className={styles.outcomeFooter}>
            <span>SOURCE · USER</span>
            <i />
            <span>RESULT · {primaryChange ? primaryChange.entityType.toUpperCase() : "NO WRITE"}</span>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="origin-title">
          <div className={styles.sectionHeading}>
            <div><span>ORIGIN</span><h2 id="origin-title">Your words remain separate from what Life OS inferred.</h2></div>
            <p>Interpretation is evidence about system behavior—not a rewrite of what you originally said.</p>
          </div>

          <div className={styles.originTrack}>
            <TraceCard
              index="01"
              eyebrow="YOU SAID"
              authority="USER SOURCE"
              authorityKind="USER_SOURCE"
              title="Original Capture"
              meta={<><span>{formatMoment(trace.source.occurredAt)}</span><span>source · {trace.source.source}</span></>}
            >
              <blockquote>{trace.source.text}</blockquote>
            </TraceCard>

            <div className={styles.connector} aria-hidden="true"><span /><ArrowIcon size={13} /></div>

            {trace.interpretation ? (
              <TraceCard
                index="02"
                eyebrow="LIFE OS SAW"
                authority="OBSERVATION"
                authorityKind="OBSERVATION"
                title={`${humanEnum(trace.interpretation.certainty)} · ${humanEnum(trace.interpretation.intent)}`}
                meta={<><span>interpreter · {humanEnum(trace.interpretation.interpreter)}</span><span>{formatMoment(trace.interpretation.createdAt)}</span></>}
              >
                <div className={styles.observationList}>
                  {trace.interpretation.observations.map((observation) => (
                    <div key={observation.id}><small>{observation.label}</small><p>{observation.value}</p></div>
                  ))}
                  {trace.interpretation.clarification && <div className={styles.clarification}><small>CLARIFICATION</small><p>{trace.interpretation.clarification}</p></div>}
                </div>
              </TraceCard>
            ) : (
              <TraceCard index="02" eyebrow="INTERPRETATION" authority="NOT RECORDED" authorityKind="OPEN" title="No interpretation recorded"><p>The trace has not reached interpretation yet.</p></TraceCard>
            )}
          </div>
        </section>

        <section className={`${styles.section} ${styles.consequenceSection}`} aria-labelledby="consequences-title">
          <div className={styles.sectionHeading}>
            <div><span>CONSEQUENCES</span><h2 id="consequences-title">Every proposal keeps its own choice and result.</h2></div>
            <p>A single Capture can eventually route to several domains. Each consequence remains separately explainable.</p>
          </div>
          <div className={styles.consequenceStack}>
            {trace.proposals.map((proposal, index) => <ProposalOutcome key={proposal.proposalId} proposal={proposal} number={index + 1} />)}
          </div>
        </section>

        <section className={styles.projectionNote} data-status={trace.projectionEffects.status}>
          <div className={styles.projectionMark}>→</div>
          <div>
            <span>DERIVED SCREEN EFFECTS</span>
            {trace.projectionEffects.status === "NOT_RECORDED_YET" ? (
              <><h2>Not recorded yet.</h2><p>Life OS will not claim that Today, Journey or another projection changed because of this interaction until that causation is actually persisted.</p></>
            ) : (
              <><h2>{trace.projectionEffects.items.length} recorded effects.</h2><p>These effects are linked to the source canonical event rather than inferred from current screen state.</p></>
            )}
          </div>
        </section>

        <section className={styles.provenanceSection}>
          <div className={styles.sectionHeading}>
            <div><span>FULL TRACE / PROVENANCE</span><h2>Identifiers are available without becoming the story.</h2></div>
            <p>Technical deployment telemetry lives elsewhere. These IDs connect the user-visible interaction chain itself.</p>
          </div>
          <details className={styles.provenance}>
            <summary>OPEN TRACE IDENTIFIERS <ArrowIcon size={12} /></summary>
            <dl>
              <div><dt>Capture</dt><dd>{trace.captureId}</dd></div>
              <div><dt>Correlation</dt><dd>{trace.correlationId}</dd></div>
              {trace.proposals.map((proposal) => <div key={proposal.proposalId}><dt>Proposal</dt><dd>{proposal.proposalId}</dd></div>)}
              {canonicalChanges.map((change) => <div key={change.eventId}><dt>Domain event</dt><dd>{change.eventId}</dd></div>)}
            </dl>
          </details>
        </section>

        <div className={styles.backRow}>
          <Link href="/memory">← BACK TO MEMORY</Link>
          <span>USER HISTORY · NOT TECHNICAL TELEMETRY</span>
        </div>

        <footer className="page-footer"><span>Life OS / Interaction Ledger UI V1</span><span>synthetic sample · read-only · artifact v1.2.0</span></footer>
      </main>
    </div>
  );
}
