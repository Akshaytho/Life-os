"use client";

import type { Session } from "@supabase/supabase-js";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { InteractionChangeTrace } from "../../../packages/contracts/interaction-change-ledger";
import type { CaptureProposalReview, ProposalReviewItem } from "../../../packages/contracts/proposal-review";
import {
  applyCalendarProposal,
  confirmCalendarProposal,
  createCapture,
  getCaptureReview,
  getInteractionTrace,
  LifeOsApiError,
  rejectProposal,
  type ConfirmCalendarProposalInput,
} from "../lib/life-os-api";
import {
  BrowserAuthConfigurationError,
  getBrowserSupabaseClient,
} from "../lib/supabase-browser";
import captureStyles from "./capture-routing.module.css";
import liveStyles from "./live-capture-routing.module.css";
import { ProposalDecisionControls } from "./proposal-decision-controls";

function humanEnum(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function confidenceLabel(value: number) {
  if (value >= 0.85) return "High";
  if (value >= 0.6) return "Medium";
  return "Low";
}

function safeFlowMessage(error: unknown): string {
  if (error instanceof LifeOsApiError) {
    if (error.code === "authentication_required") return "Your session is no longer valid. Sign in again before retrying.";
    if (error.code === "origin_not_allowed") return "This browser origin is not approved for the private Life OS API.";
    if (error.code === "network_unavailable") return "Life OS lost contact with the private API. Delivery may be uncertain; the server-side decision boundary is idempotent on retry.";
    if (error.code === "confirmation_conflict") return "These Calendar details conflict with an earlier confirmation. Reload the review before taking another action.";
    if (error.code === "proposal_not_confirmable") return "Life OS refused to promote this proposal. Reload the current review before trying again.";
    if (error.code === "confirmation_unavailable") return "Calendar confirmation is not available in this API runtime.";
    if (error.code === "proposal_not_applicable") return "Life OS refused the Apply request because this proposal is no longer eligible. Reload the review before deciding again.";
    if (error.code === "rejection_conflict") return "Life OS refused this rejection because the proposal already has a different final decision or rejection record.";
    if (error.code === "not_found") return "This proposal is no longer available to the authenticated user. Reload the review.";
  }
  return "Life OS could not complete this request. The error was kept private; you can safely reload before deciding again.";
}

function LiveReview({ review }: { review: CaptureProposalReview }) {
  const sourceWords = review.source.rawText.trim().split(/\s+/).filter(Boolean).length;
  const interpretation = review.interpretation;

  return (
    <section className={captureStyles.reviewLedger} aria-label="Persisted Capture review ledger">
      <article className={captureStyles.sourcePanel}>
        <div className={captureStyles.authorityLine}>
          <span className={captureStyles.authoritySource}>YOU SAID · USER SOURCE</span>
          <small>persisted exactly as submitted</small>
        </div>
        <blockquote style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{review.source.rawText}</blockquote>
        <div className={captureStyles.sourceFacts}>
          <span>{sourceWords} words</span>
          <span>actor · user</span>
          <span>source · {review.source.source.toLowerCase()}</span>
        </div>
      </article>

      <article className={captureStyles.observationPanel}>
        <div className={captureStyles.authorityLine}>
          <span className={captureStyles.authorityObservation}>LIFE OS SAW · OBSERVATION</span>
          <small>interpretation, not truth</small>
        </div>

        {interpretation ? (
          <>
            <div className={captureStyles.interpretationHeadline}>
              <div><small>Likely intent</small><strong>{humanEnum(interpretation.intent)}</strong></div>
              <div><small>Language certainty</small><strong>{humanEnum(interpretation.certainty)}</strong></div>
              <div><small>Interpreter certainty</small><strong>{confidenceLabel(interpretation.confidence)}</strong></div>
            </div>

            <div className={captureStyles.observations}>
              {interpretation.observations.map((item) => (
                <div key={item.id}>
                  <span>OBSERVATION</span>
                  <strong>{item.label}</strong>
                  <p>{item.value}</p>
                </div>
              ))}
            </div>

            <details className={captureStyles.interpreterDetails}>
              <summary>Interpretation provenance</summary>
              <p>{humanEnum(interpretation.interpreter)} · authority remains observation · recorded {new Date(interpretation.createdAt).toLocaleString()}</p>
            </details>
          </>
        ) : (
          <div className={liveStyles.pendingReview}>Interpretation has not been recorded yet. Your source remains intact.</div>
        )}
      </article>
    </section>
  );
}

interface LiveProposalProps {
  proposal: ProposalReviewItem;
  index: number;
  busy: boolean;
  onConfirmCalendar(proposalId: string, plan: ConfirmCalendarProposalInput): Promise<boolean>;
  onApply(proposalId: string): Promise<boolean>;
  onReject(proposalId: string, reason?: string): Promise<boolean>;
}

function LiveProposal({ proposal, index, busy, onConfirmCalendar, onApply, onReject }: LiveProposalProps) {
  return (
    <article className={captureStyles.proposal} data-destination={proposal.destination}>
      <div className={captureStyles.proposalIndex}>{String(index + 1).padStart(2, "0")}</div>
      <div className={captureStyles.proposalBody}>
        <div className={captureStyles.proposalAuthority}>
          <span>LIFE OS PROPOSES · SUGGESTION</span>
          <span className={captureStyles.destination}>{humanEnum(proposal.destination)}</span>
        </div>
        <h3>{proposal.summary}</h3>
        <p className={captureStyles.proposalReason}>{proposal.reason}</p>

        {proposal.details.length > 0 && (
          <div className={captureStyles.previewFields}>
            {proposal.details.map((detail) => (
              <div key={detail.key}>
                <span>{detail.label}</span>
                <strong>{detail.value}</strong>
              </div>
            ))}
          </div>
        )}

        <div className={captureStyles.proposalMeta}>
          <span><small>Status</small>{humanEnum(proposal.state)}</span>
          <span><small>Approval</small>{humanEnum(proposal.approvalMode)}</span>
          <span><small>Operation</small>{humanEnum(proposal.operation)}</span>
        </div>
      </div>
      <div className={captureStyles.proposalOutcome}>
        <div className={captureStyles.resultClass} data-result={proposal.proposedResultClass}>
          <span>IF APPROVED</span>
          <strong>{humanEnum(proposal.proposedResultClass)}</strong>
          <small>proposed result class</small>
        </div>
        <ProposalDecisionControls
          proposal={proposal}
          busy={busy}
          onConfirmCalendar={onConfirmCalendar}
          onApply={onApply}
          onReject={onReject}
        />
      </div>
    </article>
  );
}

interface LiveProposalsProps {
  review: CaptureProposalReview;
  busy: boolean;
  onConfirmCalendar(proposalId: string, plan: ConfirmCalendarProposalInput): Promise<boolean>;
  onApply(proposalId: string): Promise<boolean>;
  onReject(proposalId: string, reason?: string): Promise<boolean>;
}

function LiveProposals({ review, busy, onConfirmCalendar, onApply, onReject }: LiveProposalsProps) {
  return (
    <section className={captureStyles.proposalSection} aria-label="Persisted proposed consequences">
      <div className={captureStyles.sectionHeading}>
        <div>
          <span>PROPOSED CONSEQUENCES</span>
          <h2>Suggestions stay suggestions until you make a reviewed decision.</h2>
        </div>
        <p>Calendar suggestions that need details must first be confirmed by you. Only then can a ready, non-high-authority Calendar proposal enter the separate Apply flow.</p>
      </div>
      <div className={captureStyles.proposalStack}>
        {review.proposals.length > 0
          ? review.proposals.map((proposal, index) => (
            <LiveProposal
              key={proposal.proposalId}
              proposal={proposal}
              index={index}
              busy={busy}
              onConfirmCalendar={onConfirmCalendar}
              onApply={onApply}
              onReject={onReject}
            />
          ))
          : <div className={captureStyles.noProposal}>No consequence was proposed. Your persisted source remains available.</div>}
      </div>
    </section>
  );
}

function TraceSummary({ trace }: { trace: InteractionChangeTrace }) {
  const canonicalChanges = trace.proposals.filter((proposal) => proposal.canonicalChange).length;
  return (
    <details className={liveStyles.traceBox}>
      <summary>Interaction & Change trace · {humanEnum(trace.status)}</summary>
      <div className={liveStyles.traceBody}>
        <dl className={liveStyles.traceMeta}>
          <div><dt>Capture</dt><dd>{trace.captureId}</dd></div>
          <div><dt>Correlation</dt><dd>{trace.correlationId}</dd></div>
          <div><dt>Proposals</dt><dd>{trace.proposals.length}</dd></div>
          <div><dt>Canonical changes</dt><dd>{canonicalChanges}</dd></div>
        </dl>
      </div>
    </details>
  );
}

export function LiveCaptureRouting() {
  const [session, setSession] = useState<Session | null>(null);
  const [authState, setAuthState] = useState<"checking" | "signed_out" | "signed_in" | "configuration_error">("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [draft, setDraft] = useState("");
  const [review, setReview] = useState<CaptureProposalReview>();
  const [trace, setTrace] = useState<InteractionChangeTrace>();
  const [lastCaptureId, setLastCaptureId] = useState<string>();
  const [flowBusy, setFlowBusy] = useState(false);
  const [flowMessage, setFlowMessage] = useState("");
  const idempotencyAttempt = useRef<{ rawText: string; key: string } | undefined>(undefined);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    try {
      const client = getBrowserSupabaseClient();
      void client.auth.getSession().then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setAuthState("signed_out");
          setAuthMessage("Life OS could not restore the browser session.");
          return;
        }
        setSession(data.session);
        setAuthState(data.session ? "signed_in" : "signed_out");
      });

      const listener = client.auth.onAuthStateChange((_event, nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setAuthState(nextSession ? "signed_in" : "signed_out");
        if (!nextSession) {
          setReview(undefined);
          setTrace(undefined);
          setLastCaptureId(undefined);
        }
      });
      unsubscribe = () => listener.data.subscription.unsubscribe();
    } catch (error) {
      if (error instanceof BrowserAuthConfigurationError) {
        setAuthState("configuration_error");
        setAuthMessage("Live browser authentication is not configured for this deployment.");
      } else {
        setAuthState("configuration_error");
        setAuthMessage("Live browser authentication could not be initialized.");
      }
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const client = getBrowserSupabaseClient();
      const result = await client.auth.signInWithPassword({ email, password });
      setPassword("");
      if (result.error || !result.data.session) {
        setAuthMessage("Sign-in failed. Check the development account credentials and try again.");
        return;
      }
      setSession(result.data.session);
      setAuthState("signed_in");
    } catch {
      setPassword("");
      setAuthMessage("Sign-in could not be completed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    setAuthBusy(true);
    try {
      await getBrowserSupabaseClient().auth.signOut({ scope: "local" });
    } finally {
      setSession(null);
      setAuthState("signed_out");
      setAuthBusy(false);
    }
  }

  async function currentAccessToken(): Promise<string> {
    const client = getBrowserSupabaseClient();
    const result = await client.auth.getSession();
    const token = result.data.session?.access_token;
    if (!token) throw new LifeOsApiError(401, "authentication_required");
    return token;
  }

  async function readCurrentState(accessToken: string, captureId: string) {
    const [nextReview, nextTrace] = await Promise.all([
      getCaptureReview(accessToken, captureId),
      getInteractionTrace(accessToken, captureId),
    ]);
    setReview(nextReview);
    setTrace(nextTrace);
  }

  async function loadReview(captureId: string) {
    setFlowBusy(true);
    setFlowMessage("Loading the persisted review and trace…");
    try {
      const token = await currentAccessToken();
      await readCurrentState(token, captureId);
      setFlowMessage("Persisted Capture, Review and Trace loaded with the current decision state.");
    } catch (error) {
      setFlowMessage(safeFlowMessage(error));
    } finally {
      setFlowBusy(false);
    }
  }

  async function submitCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || draft.length > 800) return;

    setFlowBusy(true);
    setFlowMessage("Saving your exact source, then loading Life OS's review…");
    const attempt = idempotencyAttempt.current?.rawText === draft
      ? idempotencyAttempt.current
      : { rawText: draft, key: crypto.randomUUID() };
    idempotencyAttempt.current = attempt;

    try {
      const token = await currentAccessToken();
      const receipt = await createCapture(token, draft, attempt.key);
      setLastCaptureId(receipt.captureId);
      idempotencyAttempt.current = undefined;
      setReview(undefined);
      setTrace(undefined);

      await readCurrentState(token, receipt.captureId);
      setFlowMessage(receipt.status === "replayed"
        ? "The prior safe submission was replayed; no duplicate Capture was created."
        : "Capture saved and reviewed. Suggestions still require your decision.");
    } catch (error) {
      setFlowMessage(safeFlowMessage(error));
    } finally {
      setFlowBusy(false);
    }
  }

  async function confirmCalendarDetails(
    proposalId: string,
    plan: ConfirmCalendarProposalInput,
  ): Promise<boolean> {
    const captureId = review?.source.captureId;
    if (!captureId) return false;

    setFlowBusy(true);
    setFlowMessage("Confirming your Calendar details without applying them yet…");
    try {
      const token = await currentAccessToken();
      const receipt = await confirmCalendarProposal(token, proposalId, plan);
      await readCurrentState(token, captureId);
      setFlowMessage(receipt.status === "replayed"
        ? "These exact Calendar details were already confirmed. The proposal is ready for your separate Apply decision."
        : "Calendar details confirmed. No Calendar event exists yet; the proposal is now ready for your separate Apply decision.");
      return true;
    } catch (error) {
      setFlowMessage(safeFlowMessage(error));
      return false;
    } finally {
      setFlowBusy(false);
    }
  }

  async function applyProposalDecision(proposalId: string): Promise<boolean> {
    const captureId = review?.source.captureId;
    if (!captureId) return false;

    setFlowBusy(true);
    setFlowMessage("Sending your explicit Calendar Apply decision for server-side revalidation…");
    try {
      const token = await currentAccessToken();
      const receipt = await applyCalendarProposal(token, proposalId);
      await readCurrentState(token, captureId);
      setFlowMessage(receipt.status === "replayed"
        ? "This Apply decision had already committed safely; Life OS returned the existing result."
        : "Your explicit decision was applied. The refreshed trace now shows the canonical Calendar change.");
      return true;
    } catch (error) {
      setFlowMessage(safeFlowMessage(error));
      return false;
    } finally {
      setFlowBusy(false);
    }
  }

  async function rejectProposalDecision(proposalId: string, reason?: string): Promise<boolean> {
    const captureId = review?.source.captureId;
    if (!captureId) return false;

    setFlowBusy(true);
    setFlowMessage("Recording your proposal rejection…");
    try {
      const token = await currentAccessToken();
      const receipt = await rejectProposal(token, proposalId, reason);
      await readCurrentState(token, captureId);
      setFlowMessage(receipt.status === "replayed"
        ? "This exact rejection was already recorded; Life OS returned the existing decision provenance."
        : "Suggestion rejected. The refreshed review records your decision without creating canonical life state.");
      return true;
    } catch (error) {
      setFlowMessage(safeFlowMessage(error));
      return false;
    } finally {
      setFlowBusy(false);
    }
  }

  const draftChanged = review ? draft !== review.source.rawText : false;
  const canonicalChanges = trace?.proposals.filter((proposal) => proposal.canonicalChange).length ?? 0;

  return (
    <main className={captureStyles.canvas}>
      <header className="system-bar">
        <div className="wordmark">LIFE<span>/</span>OS</div>
        <div className="system-state"><i />PRIVATE · LIVE DEV</div>
      </header>

      <section className={captureStyles.hero}>
        <div className={captureStyles.heroTop}>
          <span>CAPTURE / REVIEW</span>
          <span>AUTHENTICATED DEVELOPMENT</span>
        </div>
        <div className={captureStyles.heroGrid}>
          <div><span className="section-kicker">REAL PRIVATE TRANSPORT</span><h1>You say it.<br />Life OS saves the source, then shows its work.</h1></div>
          <p>This development surface uses your Supabase session and the private Railway API. AI or fallback interpretation can propose; you resolve missing Calendar details, then make a separate Apply decision.</p>
        </div>
      </section>

      {authState !== "signed_in" && (
        <section className={liveStyles.authPanel} aria-label="Life OS development sign in">
          <div className={liveStyles.authTopline}><span>PRIVATE SESSION</span><span>{authState === "checking" ? "CHECKING" : "SIGNED OUT"}</span></div>
          <h2>Sign in before Life OS can read or save private Capture.</h2>
          <p>The browser receives only a normal Supabase user session. The API still verifies that session and PostgreSQL still enforces the user scope.</p>
          {authState !== "configuration_error" && (
            <form className={liveStyles.authForm} onSubmit={signIn}>
              <label>Email<input autoComplete="username" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label>Password<input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              <button disabled={authBusy || authState === "checking"} type="submit">{authBusy ? "Signing in…" : "Sign in"}</button>
            </form>
          )}
          {authMessage && <p className={liveStyles.authMessage}>{authMessage}</p>}
        </section>
      )}

      {authState === "signed_in" && session && (
        <>
          <section className={liveStyles.sessionRow} aria-label="Authenticated browser session">
            <span className={liveStyles.sessionState}><i />Authenticated user session · private API enabled</span>
            <button disabled={authBusy || flowBusy} onClick={signOut} type="button">Sign out</button>
          </section>

          <section className={captureStyles.captureInstrument} aria-label="Live Capture input">
            <form onSubmit={submitCapture}>
              <div className={captureStyles.instrumentTopline}>
                <span>YOUR CAPTURE</span>
                <span>PERSISTED SOURCE · USER DECISION REQUIRED</span>
              </div>
              <textarea
                aria-label="Natural language Capture"
                maxLength={800}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Tell Life OS what happened, what you want, what changed, or what you're thinking…"
                rows={5}
                value={draft}
              />
              <div className={captureStyles.inputFooter}>
                <div>
                  <span>{draft.length}/800</span>
                  {draftChanged && <small>Draft changed · the review below remains attached to your last saved source.</small>}
                </div>
                <button disabled={flowBusy || !draft.trim()} type="submit">{flowBusy ? "Working…" : "Save + review"}<b>→</b></button>
              </div>
            </form>
          </section>

          {flowMessage && (
            <section className={liveStyles.flowStatus} aria-live="polite">
              <span>LIVE FLOW</span><p>{flowMessage}</p>
            </section>
          )}

          {lastCaptureId && !review && !flowBusy && (
            <div className={liveStyles.retryRow}><button className={liveStyles.retryButton} onClick={() => void loadReview(lastCaptureId)} type="button">Reload saved review</button></div>
          )}

          <section className={captureStyles.reviewLock} aria-label="Canonical write boundary status">
            <div className={captureStyles.zeroMark}>{canonicalChanges}</div>
            <div>
              <span>CANONICAL LIFE-STATE WRITES</span>
              <strong>{canonicalChanges === 0 ? "Your saved Capture has not changed canonical life state." : "Your explicit decision produced a canonical change recorded in this trace."}</strong>
              <p>Confirming proposal details only prepares a suggestion. Only the later Apply boundary can create the currently supported Calendar canonical change.</p>
            </div>
            <div className={captureStyles.lockState}><i /> {canonicalChanges === 0 ? "AWAITING USER AUTHORITY" : "USER DECISION RECORDED"}</div>
          </section>

          {review ? (
            <>
              <LiveReview review={review} />
              {review.interpretation?.clarification && (
                <aside className={captureStyles.clarification}>
                  <div><span>NEEDS YOU</span><strong>Life OS will not fill this gap by guessing.</strong></div>
                  <p>{review.interpretation.clarification}</p>
                  <small>Missing detail or authority remains unresolved until you clarify it.</small>
                </aside>
              )}
              <LiveProposals
                review={review}
                busy={flowBusy}
                onConfirmCalendar={confirmCalendarDetails}
                onApply={applyProposalDecision}
                onReject={rejectProposalDecision}
              />
              {trace && <TraceSummary trace={trace} />}
            </>
          ) : (
            <div className={liveStyles.pendingReview}>No persisted Capture is selected yet. Your draft stays in the browser until you choose Save + review.</div>
          )}

          <section className={captureStyles.boundary}>
            <div className={captureStyles.boundaryMark}>{canonicalChanges}</div>
            <div>
              <span>APPROVAL / COMMIT BOUNDARY</span>
              <h2>Your decision is the boundary.</h2>
              <p>Calendar confirmation resolves the plan but does not commit it. Apply remains a separate explicit action and the API revalidates everything before canonical write. Reject records your decision without creating canonical life state.</p>
            </div>
            <div className={captureStyles.boundaryStates}>
              <span>Source <b>{review ? "persisted" : "draft"}</b></span>
              <span>Observation <b>{review?.interpretation ? "visible" : "none"}</b></span>
              <span>Suggestions <b>{review ? review.proposals.length : 0}</b></span>
              <span>Decision UI <b>confirm → apply</b></span>
            </div>
          </section>
        </>
      )}

      <footer className={captureStyles.footer}>
        <span>SUPABASE SESSION · PRIVATE RAILWAY API · RLS</span>
        <span>LIFE-OS-CANON-001 / 1.2.0</span>
      </footer>
    </main>
  );
}
