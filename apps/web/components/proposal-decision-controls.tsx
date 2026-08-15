"use client";

import { useState } from "react";
import type { ProposalReviewItem } from "../../../packages/contracts/proposal-review";
import type { ConfirmCalendarProposalInput } from "../lib/life-os-api";
import styles from "./proposal-decision-controls.module.css";

export interface ProposalDecisionControlsProps {
  proposal: ProposalReviewItem;
  busy: boolean;
  onConfirmCalendar(proposalId: string, plan: ConfirmCalendarProposalInput): Promise<boolean>;
  onApply(proposalId: string): Promise<boolean>;
  onReject(proposalId: string, reason?: string): Promise<boolean>;
}

type DecisionMode = "NONE" | "CALENDAR_DETAILS" | "APPLY" | "REJECT";

const categories: ConfirmCalendarProposalInput["category"][] = [
  "Work", "Creator", "Learning", "Health", "Family", "Friends", "Travel", "Personal", "Rest",
];
const commitments: ConfirmCalendarProposalInput["commitment"][] = ["Fixed", "Important", "Flexible", "Optional"];

function humanEnum(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function detail(proposal: ProposalReviewItem, key: string): string {
  return proposal.details.find((item) => item.key === key)?.value ?? "";
}

function localInputValue(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function absoluteIsoFromLocal(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function detectedTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
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
  if (proposal.state === "NEEDS_CONFIRMATION") return "Confirm the Calendar details before Apply.";
  if (proposal.state !== "READY_TO_APPLY") return `Not ready to apply · ${humanEnum(proposal.state)}.`;
  return undefined;
}

function canConfirmCalendar(proposal: ProposalReviewItem): boolean {
  return proposal.destination === "CALENDAR"
    && proposal.operation === "CREATE_CALENDAR_PLAN"
    && proposal.approvalMode === "EXPLICIT_CONFIRMATION"
    && proposal.state === "NEEDS_CONFIRMATION";
}

function isFinal(proposal: ProposalReviewItem) {
  return proposal.state === "APPLIED" || proposal.state === "REJECTED";
}

export function ProposalDecisionControls({
  proposal,
  busy,
  onConfirmCalendar,
  onApply,
  onReject,
}: ProposalDecisionControlsProps) {
  const [mode, setMode] = useState<DecisionMode>("NONE");
  const [reason, setReason] = useState("");
  const [title, setTitle] = useState(() => detail(proposal, "title"));
  const [startsAt, setStartsAt] = useState(() => localInputValue(detail(proposal, "startsAt")));
  const [endsAt, setEndsAt] = useState(() => localInputValue(detail(proposal, "endsAt")));
  const initialCategory = detail(proposal, "category");
  const initialCommitment = detail(proposal, "commitment");
  const [category, setCategory] = useState(categories.includes(initialCategory as ConfirmCalendarProposalInput["category"])
    ? initialCategory as ConfirmCalendarProposalInput["category"] : "");
  const [commitment, setCommitment] = useState(commitments.includes(initialCommitment as ConfirmCalendarProposalInput["commitment"])
    ? initialCommitment as ConfirmCalendarProposalInput["commitment"] : "");
  const [calendarError, setCalendarError] = useState("");
  const applyBlocked = applyBlockReason(proposal);
  const calendarConfirmationAvailable = canConfirmCalendar(proposal);

  if (isFinal(proposal)) {
    return (
      <div className={styles.finalState}>
        <i /> {proposal.state === "APPLIED" ? "Applied by user decision" : "Rejected by user decision"}
      </div>
    );
  }

  async function confirmDetails() {
    setCalendarError("");
    const startIso = absoluteIsoFromLocal(startsAt);
    const endIso = absoluteIsoFromLocal(endsAt);
    if (!title.trim() || !startIso || !endIso || !category || !commitment) {
      setCalendarError("Title, start, end, category and commitment all need your confirmation.");
      return;
    }
    if (Date.parse(endIso) <= Date.parse(startIso)) {
      setCalendarError("End time must be after start time.");
      return;
    }

    const succeeded = await onConfirmCalendar(proposal.proposalId, {
      title: title.trim(),
      startsAt: startIso,
      endsAt: endIso,
      category,
      commitment,
      timeZone: detectedTimeZone(),
    });
    if (succeeded) setMode("NONE");
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
            {calendarConfirmationAvailable && (
              <button className={styles.button} disabled={busy} onClick={() => setMode("CALENDAR_DETAILS")} type="button">
                Confirm Calendar details
              </button>
            )}
            {!applyBlocked && (
              <button className={styles.button} disabled={busy} onClick={() => setMode("APPLY")} type="button">
                Review Apply
              </button>
            )}
            <button className={styles.dangerButton} disabled={busy} onClick={() => setMode("REJECT")} type="button">
              Reject suggestion
            </button>
          </div>
          {applyBlocked && !calendarConfirmationAvailable && <p className={styles.blocked}>Apply unavailable · {applyBlocked}</p>}
        </>
      )}

      {mode === "CALENDAR_DETAILS" && (
        <div className={styles.confirmation} role="region" aria-label="Confirm Calendar proposal details">
          <strong>Confirm the Calendar details before this can become ready to apply.</strong>
          <p>
            These values come from your review, not from hidden inference. Missing fields stay empty until you choose them.
            Times below use this browser&apos;s timezone: <b>{detectedTimeZone()}</b>.
          </p>
          <div className={styles.fieldGrid}>
            <label className={styles.wideField}>Title<input maxLength={160} onChange={(event) => setTitle(event.target.value)} value={title} /></label>
            <label>Start<input onChange={(event) => setStartsAt(event.target.value)} type="datetime-local" value={startsAt} /></label>
            <label>End<input onChange={(event) => setEndsAt(event.target.value)} type="datetime-local" value={endsAt} /></label>
            <label>Category<select onChange={(event) => setCategory(event.target.value as typeof category)} value={category}>
              <option value="">Choose category</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select></label>
            <label>Commitment<select onChange={(event) => setCommitment(event.target.value as typeof commitment)} value={commitment}>
              <option value="">Choose commitment</option>
              {commitments.map((item) => <option key={item} value={item}>{item}</option>)}
            </select></label>
          </div>
          {calendarError && <p className={styles.formError}>{calendarError}</p>}
          <div className={styles.confirmRow}>
            <button className={styles.confirmButton} disabled={busy} onClick={() => void confirmDetails()} type="button">
              {busy ? "Confirming…" : "Confirm details"}
            </button>
            <button className={styles.cancelButton} disabled={busy} onClick={() => setMode("NONE")} type="button">Cancel</button>
          </div>
        </div>
      )}

      {mode === "APPLY" && (
        <div className={styles.confirmation} role="region" aria-label="Explicit Calendar apply confirmation">
          <strong>This action will create a Calendar plan.</strong>
          <p>
            You are explicitly approving the already-confirmed suggestion. Life OS will re-check your identity, proposal
            state, approval mode and Calendar details before committing.
          </p>
          <div className={styles.confirmRow}>
            <button className={styles.confirmButton} disabled={busy} onClick={() => void confirmApply()} type="button">
              {busy ? "Applying…" : "Confirm + create Calendar"}
            </button>
            <button className={styles.cancelButton} disabled={busy} onClick={() => setMode("NONE")} type="button">Cancel</button>
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
            <button className={styles.cancelButton} disabled={busy} onClick={() => setMode("NONE")} type="button">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
