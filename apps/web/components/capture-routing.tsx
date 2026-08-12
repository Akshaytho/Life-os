"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  ApprovalMode,
  ProposalState,
  RoutingDestination,
  RoutingInterpretation,
  RoutingProposal,
  RoutingTrustClass,
} from "../../../packages/contracts/input-routing";
import { captureExamples, interpretCapture } from "../lib/routing-sample";
import styles from "./capture-routing.module.css";

const destinationLabels: Record<RoutingDestination, string> = {
  TODAY: "Today",
  CALENDAR: "Calendar",
  JOURNEY: "Journey",
  MEMORY: "Memory",
  YOU: "You",
  BRAIN_DUMP: "Brain Dump",
  DRIFT: "Drift",
  NOT_NOW: "Not Now",
};

const stateLabels: Record<ProposalState, string> = {
  PROPOSED: "Proposed",
  NEEDS_CONFIRMATION: "Needs you",
  READY_TO_APPLY: "Review ready",
  REJECTED: "Rejected",
  APPLIED: "Applied",
};

const approvalLabels: Record<ApprovalMode, string> = {
  REVIEW_AND_APPLY: "Review + apply",
  EXPLICIT_CONFIRMATION: "Explicit confirmation",
  HIGH_AUTHORITY_APPROVAL: "High-authority review",
};

const resultLabels: Record<RoutingTrustClass, string> = {
  FACT: "Fact",
  REFLECTION: "Reflection",
  OBSERVATION: "Observation",
  SUGGESTION: "Suggestion",
  DECISION: "Decision",
};

function confidenceLabel(value: number) {
  if (value >= 0.85) return "High";
  if (value >= 0.6) return "Medium";
  return "Low";
}

function ProcessRail() {
  const stages = [
    ["01", "Capture", "source"],
    ["02", "Interpret", "observation"],
    ["03", "Propose", "suggestion"],
    ["04", "Review", "you inspect"],
    ["05", "Confirm", "future"],
    ["06", "Commit", "future"],
  ] as const;

  return (
    <section className={styles.process} aria-label="Capture to commit lifecycle">
      <div className={styles.processHeading}>
        <span>PROVENANCE / FLOW</span>
        <p>The first four steps can be inspected here. Confirm and Commit remain disconnected.</p>
      </div>
      <div className={styles.stageRail}>
        {stages.map(([number, label, note], index) => (
          <div className={styles.stage} data-future={index > 3 ? "true" : "false"} key={label}>
            <span>{number}</span>
            <strong>{label}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReviewLedger({ source, value }: { source: string; value: RoutingInterpretation }) {
  const sourceWords = useMemo(() => source.trim().split(/\s+/).filter(Boolean).length, [source]);

  return (
    <section className={styles.reviewLedger} aria-label="Capture review ledger">
      <article className={styles.sourcePanel}>
        <div className={styles.authorityLine}>
          <span className={styles.authoritySource}>YOU SAID · USER SOURCE</span>
          <small>highest authority in this review</small>
        </div>
        <blockquote>{source || "Nothing submitted yet."}</blockquote>
        <div className={styles.sourceFacts}>
          <span>{sourceWords} words</span>
          <span>actor · user</span>
          <span>canonical write · none</span>
        </div>
      </article>

      <article className={styles.observationPanel}>
        <div className={styles.authorityLine}>
          <span className={styles.authorityObservation}>LIFE OS SAW · OBSERVATION</span>
          <small>interpretation, not truth</small>
        </div>

        <div className={styles.interpretationHeadline}>
          <div>
            <small>Likely intent</small>
            <strong>{value.intent.replaceAll("_", " ").toLowerCase()}</strong>
          </div>
          <div>
            <small>Language certainty</small>
            <strong>{value.certainty.toLowerCase()}</strong>
          </div>
          <div>
            <small>Interpreter certainty</small>
            <strong>{confidenceLabel(value.confidence)}</strong>
          </div>
        </div>

        <div className={styles.observations}>
          {value.observations.map((item) => (
            <div key={item.id}>
              <span>OBSERVATION</span>
              <strong>{item.label}</strong>
              <p>{item.value}</p>
            </div>
          ))}
        </div>

        <details className={styles.interpreterDetails}>
          <summary>Interpretation provenance</summary>
          <p>{value.interpreter.replaceAll("_", " ").toLowerCase()} · sample certainty {Math.round(value.confidence * 100)}% · authority remains observation</p>
        </details>
      </article>
    </section>
  );
}

function ResultClass({ value }: { value: RoutingTrustClass }) {
  return (
    <div className={styles.resultClass} data-result={value}>
      <span>IF APPROVED</span>
      <strong>{resultLabels[value]}</strong>
      <small>proposed result class</small>
    </div>
  );
}

function ProposalRow({ item, index }: { item: RoutingProposal; index: number }) {
  return (
    <article className={styles.proposal} data-destination={item.destination}>
      <div className={styles.proposalIndex}>{String(index + 1).padStart(2, "0")}</div>

      <div className={styles.proposalBody}>
        <div className={styles.proposalAuthority}>
          <span>LIFE OS PROPOSES · SUGGESTION</span>
          <span className={styles.destination}>{destinationLabels[item.destination]}</span>
        </div>
        <h3>{item.summary}</h3>
        <p className={styles.proposalReason}>{item.reason}</p>

        {item.preview && (
          <div className={styles.previewFields}>
            {item.preview.map((field) => (
              <div key={field.label}>
                <span>{field.label}</span>
                <strong>{field.value}</strong>
              </div>
            ))}
          </div>
        )}

        <div className={styles.proposalMeta}>
          <span><small>Status</small>{stateLabels[item.state]}</span>
          <span><small>Approval</small>{approvalLabels[item.approvalMode]}</span>
          <span><small>Operation</small>{item.operation.replaceAll("_", " ").toLowerCase()}</span>
        </div>
      </div>

      <div className={styles.proposalOutcome}>
        <ResultClass value={item.targetTrustClass} />
        <button className={styles.apply} disabled>{item.state === "NEEDS_CONFIRMATION" ? "Confirmation unavailable" : "Apply unavailable"}</button>
      </div>
    </article>
  );
}

function Proposals({ value }: { value: RoutingInterpretation }) {
  return (
    <section className={styles.proposalSection} aria-label="Proposed consequences">
      <div className={styles.sectionHeading}>
        <div>
          <span>PROPOSED CONSEQUENCES</span>
          <h2>What Life OS would do—only if you approve it.</h2>
        </div>
        <p>Every row is still a suggestion. “If approved” describes the resulting record class, not what is true now.</p>
      </div>

      <div className={styles.proposalStack}>
        {value.proposals.length > 0
          ? value.proposals.map((item, index) => <ProposalRow item={item} index={index} key={item.id} />)
          : <div className={styles.noProposal}>No consequence proposed. Your source remains intact.</div>}
      </div>
    </section>
  );
}

export function CaptureRouting({ initialInput = captureExamples[0] }: { initialInput?: string }) {
  const [draft, setDraft] = useState<string>(initialInput);
  const [submittedSource, setSubmittedSource] = useState<string>(initialInput);
  const [interpretation, setInterpretation] = useState<RoutingInterpretation>(() => interpretCapture(initialInput));
  const draftChanged = draft !== submittedSource;

  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedSource(draft);
    setInterpretation(interpretCapture(draft));
  }

  function chooseExample(value: string) {
    setDraft(value);
    setSubmittedSource(value);
    setInterpretation(interpretCapture(value));
  }

  return (
    <main className={styles.canvas}>
      <header className="system-bar">
        <div className="wordmark">LIFE<span>/</span>OS</div>
        <div className="system-state"><i />PRIVATE · SAMPLE</div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <span>CAPTURE / REVIEW</span>
          <span>READ-ONLY PROTOTYPE</span>
        </div>
        <div className={styles.heroGrid}>
          <div>
            <span className="section-kicker">BEFORE ANYTHING CHANGES</span>
            <h1>You said it.<br />Life OS shows its work.</h1>
          </div>
          <p>Review your exact words, the system’s observation, and every proposed consequence before anything is allowed to become part of your life record.</p>
        </div>
      </section>

      <section className={styles.captureInstrument} aria-label="Capture input">
        <form onSubmit={preview}>
          <div className={styles.instrumentTopline}>
            <span>YOUR DRAFT</span>
            <span>LOCAL SAMPLE INTERPRETER</span>
          </div>
          <textarea
            aria-label="Natural language capture"
            maxLength={800}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Tell Life OS what happened, what you want, what changed, or what you're thinking…"
            rows={5}
            value={draft}
          />
          <div className={styles.inputFooter}>
            <div>
              <span>{draft.length}/800</span>
              {draftChanged && <small>Draft changed · review below still reflects your last submission.</small>}
            </div>
            <button type="submit">{draftChanged ? "Review changes" : "Review meaning"}<b>→</b></button>
          </div>
        </form>

        <div className={styles.examples}>
          <span>TRY DIFFERENT MEANINGS</span>
          <div>{captureExamples.map((example) => <button type="button" onClick={() => chooseExample(example)} key={example}>{example}</button>)}</div>
        </div>
      </section>

      <section className={styles.reviewLock} aria-label="Write boundary status">
        <div className={styles.zeroMark}>0</div>
        <div>
          <span>CANONICAL WRITES</span>
          <strong>Review only. Nothing changed.</strong>
          <p>Today, Calendar, Journey, Memory and You remain untouched.</p>
        </div>
        <div className={styles.lockState}><i /> SAFE TO INSPECT</div>
      </section>

      <ReviewLedger source={submittedSource} value={interpretation} />

      {interpretation.clarification && (
        <aside className={styles.clarification}>
          <div><span>NEEDS YOU</span><strong>Life OS will not fill this gap by guessing.</strong></div>
          <p>{interpretation.clarification}</p>
          <small>Missing detail or authority remains unresolved until you clarify it.</small>
        </aside>
      )}

      <Proposals value={interpretation} />
      <ProcessRail />

      <section className={styles.boundary}>
        <div className={styles.boundaryMark}>0</div>
        <div>
          <span>COMMIT BOUNDARY</span>
          <h2>Still only a review.</h2>
          <p>Real Confirm and Apply remain intentionally disconnected until persisted proposals, authenticated ownership, authorization, backend revalidation and transactional writes are wired to this screen.</p>
        </div>
        <div className={styles.boundaryStates}>
          <span>Source <b>visible</b></span>
          <span>Observation <b>visible</b></span>
          <span>Suggestions <b>visible</b></span>
          <span>Mutation <b>none</b></span>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>LOCAL SAMPLE LOGIC · NOT PRODUCTION AI</span>
        <span>LIFE-OS-CANON-001 / 1.1.0</span>
      </footer>
    </main>
  );
}
