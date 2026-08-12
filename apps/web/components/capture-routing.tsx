"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  ApprovalMode,
  ProposalState,
  RoutingDestination,
  RoutingInterpretation,
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
  NEEDS_CONFIRMATION: "Needs confirmation",
  READY_TO_APPLY: "Ready to review",
  REJECTED: "Rejected",
  APPLIED: "Applied",
};

const approvalLabels: Record<ApprovalMode, string> = {
  REVIEW_AND_APPLY: "Review + apply",
  EXPLICIT_CONFIRMATION: "Explicit confirmation",
  HIGH_AUTHORITY_APPROVAL: "High-authority approval",
};

function confidenceLabel(value: number) {
  if (value >= 0.85) return "High";
  if (value >= 0.6) return "Medium";
  return "Low";
}

function StageRail() {
  const stages = [
    ["01", "Capture", "user source"],
    ["02", "Interpret", "observation"],
    ["03", "Route", "owners"],
    ["04", "Propose", "no write"],
    ["05", "Confirm", "future"],
    ["06", "Commit", "future"],
  ] as const;

  return (
    <div className={styles.stageRail} aria-label="Routing lifecycle">
      {stages.map(([number, label, note], index) => (
        <div className={styles.stage} data-future={index > 3 ? "true" : "false"} key={label}>
          <span>{number}</span>
          <strong>{label}</strong>
          <small>{note}</small>
        </div>
      ))}
    </div>
  );
}

function InterpretationSummary({ value }: { value: RoutingInterpretation }) {
  return (
    <section className={styles.interpretation} aria-label="Interpretation summary">
      <div className={styles.sectionHeading}>
        <div><span>INTERPRETATION / OBSERVATION</span><h2>What Life OS thinks you meant.</h2></div>
        <p>Interpretation confidence describes parser certainty only. It never raises authority.</p>
      </div>

      <div className={styles.readout}>
        <div><span>Intent</span><strong>{value.intent.replaceAll("_", " ")}</strong></div>
        <div><span>Certainty</span><strong>{value.certainty.toLowerCase()}</strong></div>
        <div><span>Interpretation</span><strong>{confidenceLabel(value.confidence)}</strong><small>{Math.round(value.confidence * 100)}% sample confidence</small></div>
      </div>

      <div className={styles.observations}>
        {value.observations.map((item) => (
          <div key={item.id}><span>OBSERVATION</span><strong>{item.label}</strong><p>{item.value}</p></div>
        ))}
      </div>
    </section>
  );
}

function Proposals({ value }: { value: RoutingInterpretation }) {
  return (
    <section className={styles.proposalSection} aria-label="Proposed routing effects">
      <div className={styles.sectionHeading}>
        <div><span>ROUTE / PROPOSE</span><h2>Where this would go.</h2></div>
        <p>One sentence can affect more than one owner. Each consequence stays separate and inspectable.</p>
      </div>

      <div className={styles.proposalStack}>
        {value.proposals.map((item, index) => (
          <article className={styles.proposal} data-destination={item.destination} key={item.id}>
            <div className={styles.proposalIndex}>{String(index + 1).padStart(2, "0")}</div>
            <div className={styles.proposalBody}>
              <div className={styles.proposalTopline}>
                <span className={styles.destination}>{destinationLabels[item.destination]}</span>
                <span className={styles.state} data-state={item.state}>{stateLabels[item.state]}</span>
              </div>
              <h3>{item.summary}</h3>
              <div className={styles.proposalMeta}>
                <span><small>Operation</small>{item.operation.replaceAll("_", " ").toLowerCase()}</span>
                <span><small>If applied</small>{item.targetTrustClass.toLowerCase()}</span>
                <span><small>Approval</small>{approvalLabels[item.approvalMode]}</span>
              </div>
              {item.preview && (
                <div className={styles.previewFields}>{item.preview.map((field) => <div key={field.label}><span>{field.label}</span><strong>{field.value}</strong></div>)}</div>
              )}
              <details className={styles.reason}>
                <summary>Why this route?</summary>
                <p>{item.reason}</p>
              </details>
            </div>
            <button className={styles.apply} disabled>{item.state === "NEEDS_CONFIRMATION" ? "Confirm later" : "Apply later"}</button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CaptureRouting() {
  const initial = captureExamples[0];
  const [draft, setDraft] = useState<string>(initial);
  const [interpretation, setInterpretation] = useState<RoutingInterpretation>(() => interpretCapture(initial));
  const sourceWords = useMemo(() => interpretation.input.trim().split(/\s+/).filter(Boolean).length, [interpretation.input]);

  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInterpretation(interpretCapture(draft));
  }

  function chooseExample(value: string) {
    setDraft(value);
    setInterpretation(interpretCapture(value));
  }

  return (
    <main className={styles.canvas}>
      <header className="system-bar">
        <div className="wordmark">LIFE<span>/</span>OS</div>
        <div className="system-state"><i />PRIVATE · SAMPLE</div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroTop}><span>CAPTURE / ROUTING LAB</span><span>NO PERSISTENCE</span></div>
        <div className={styles.heroGrid}>
          <div><span className="section-kicker">SAY IT NATURALLY</span><h1>Say it once.<br />See where it would go.</h1></div>
          <p>Capture owns no life truth. Your words stay the source; Life OS interprets, routes and proposes consequences before anything can become canonical.</p>
        </div>
      </section>

      <StageRail />

      <section className={styles.captureInstrument} aria-label="Capture input">
        <form onSubmit={preview}>
          <div className={styles.instrumentTopline}><span>RAW USER INPUT</span><span>LOCAL SAMPLE INTERPRETER</span></div>
          <textarea
            aria-label="Natural language capture"
            maxLength={800}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Tell Life OS what happened, what you want, what changed, or what you're thinking…"
            rows={5}
            value={draft}
          />
          <div className={styles.inputFooter}>
            <span>{draft.length}/800</span>
            <button type="submit">Preview routing <b>→</b></button>
          </div>
        </form>

        <div className={styles.examples}>
          <span>TRY DIFFERENT SEMANTICS</span>
          <div>{captureExamples.map((example) => <button type="button" onClick={() => chooseExample(example)} key={example}>{example}</button>)}</div>
        </div>
      </section>

      <section className={styles.sourceStrip}>
        <div><span>SOURCE / USER</span><p>“{interpretation.input || "Nothing captured yet."}”</p></div>
        <div className={styles.sourceFacts}><span>{sourceWords} words</span><span>actor · USER</span><span>write · NONE</span></div>
      </section>

      {interpretation.clarification && (
        <aside className={styles.clarification}>
          <span>NEEDS YOU</span>
          <p>{interpretation.clarification}</p>
          <small>Life OS asks rather than inventing missing authority or detail.</small>
        </aside>
      )}

      <InterpretationSummary value={interpretation} />
      <Proposals value={interpretation} />

      <section className={styles.boundary}>
        <div className={styles.boundaryMark}>0</div>
        <div><span>CANONICAL WRITES</span><h2>Nothing has been changed.</h2><p>Confirm and Apply are intentionally disabled. Persistence comes later with backend revalidation, transactional canonical mutation, and an append-only domain event.</p></div>
        <div className={styles.boundaryStates}><span>Capture <b>visible</b></span><span>Interpretation <b>visible</b></span><span>Proposal <b>visible</b></span><span>Mutation <b>none</b></span></div>
      </section>

      <footer className={styles.footer}>
        <span>LOCAL SAMPLE LOGIC · NOT PRODUCTION AI</span>
        <span>LIFE-OS-CANON-001 / 1.1.0</span>
      </footer>
    </main>
  );
}
