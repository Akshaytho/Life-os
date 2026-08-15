"use client";

import { useState } from "react";
import type { ProposalReviewItem } from "../../../packages/contracts/proposal-review";
import styles from "./proposal-decision-controls.module.css";

export interface ProposalDecisionControlsProps {
  proposal: ProposalReviewItem;
  busy: boolean;
  onApply(proposalId: string): Promise<boolean>;
  onReject(proposalId: string, reason?: string): Promise<boolean>;
}

type DecisionMode = "NONE" | "APPLY" | "REJECT";

function humanEnum(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function applyBlockReason(proposal: ProposalReviewItem): string | undefined {
  if (proposal.state === "APPLIED") return "Already applied.";
  if (proposal.state === "REJECTED") return "Rejected proposals cannot be applied.";
  if (proposal.approvalMode === "HIGH_AUTHORITY_APPROVAL") {
    return "High-authority approval requires a dedicated flow.";
  }
  if (proposal.destination !== "CALENDAR" || proposal.operation !== "CREATE_CALENDAR_PLAN") {
    return "No reviewed canonical Apply implementation exists for this proposal type yet.";
  }
  if (proposal.state !== "READY_TO_APPLY") {
    return `Not ready to apply · ${humanEnum(proposal.state)}.`;
  }
  return undefined;
}

function isFinal(proposal: ProposalReviewItem) {
  return proposal.state === "APPLIED" || proposal.state === "REJECTED";
}

export function ProposalDecisionControls({
  proposal,
  busy,
  onApply,
  onReject,
}: ProposalDecisionControlsProps) {
  const [mode, setMode] = useState<DecisionMode>("NONE");
  const [reason, setReason] = useState("");
  const applyBlocked = applyBlockReason(proposal);

  if (isFinal(proposal)) {
    return (
      <div className={styles.finalState}>
        <i /> {proposal.state === "APPLIED" ? "Applied by user decision" : "Rejected by user decision"}
      </div>
    );
  }

  async function confirmApply() {
    const succeeded = await onApply(proposal.proposalId);
    if (succeeded) setMode("NONE");
  }

  async function confirmReject() {
    const succeeded = await onReject(proposal.proposalId, reason || undefined);
    if (succeeded) {
      setReason("");
      setMode("NONE");
    }
  }

  return (
    <div className={styles.controls}>
      {mode === "NONE" && (
        <>
          <div className={styles.primaryRow}>
            {!applyBlocked && (
              <button className={styles.button} disabled={busy} onClick={() => setMode("APPLY")} type="button">
                Review Apply
              </button>
            )}
            <button className={styles.dangerButton} disabled={busy} onClick={() => setMode("REJECT")} type="button">
              Reject suggestion
            </button>
          </div>
          {applyBlocked && <p className={styles.blocked}>Apply unavailable · {applyBlocked}</p>}
        </>
      )}

      {mode === "APPLY" && (
        <div className={styles.confirmation} role="region" aria-label="Explicit Calendar apply confirmation">
          <strong>This action will create a Calendar plan.</strong>
          <p>
            You are explicitly confirming this saved suggestion. Life OS will send that decision to the private API,
            which will re-check your identity, proposal state, approval mode and Calendar details before committing.
          </p>
          <div className={styles.confirmRow}>
            <button className={styles.confirmButton} disabled={busy} onClick={() => void confirmApply()} type="button">
              {busy ? "Applying…" : "Confirm + create Calendar"}
            </button>
            <button className={styles.cancelButton} disabled={busy} onClick={() => setMode("NONE")} type="button">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "REJECT" && (
        <div className={styles.confirmation} role="region" aria-label="Proposal rejection confirmation">
          <strong>Reject this suggestion?</strong>
          <p>
            Rejection records your decision and prevents this proposal from being applied later. Feedback is optional and
            stays attached to the rejection provenance.
          </p>
          <textarea
            aria-label="Optional rejection reason"
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Optional: tell Life OS why this suggestion is wrong or not useful…"
            value={reason}
          />
          <span className={styles.reasonCount}>{reason.length}/1000</span>
          <div className={styles.confirmRow}>
            <button className={styles.dangerButton} disabled={busy} onClick={() => void confirmReject()} type="button">
              {busy ? "Rejecting…" : "Confirm rejection"}
            </button>
            <button className={styles.cancelButton} disabled={busy} onClick={() => setMode("NONE")} type="button">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
