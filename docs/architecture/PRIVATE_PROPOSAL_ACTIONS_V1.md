# Private Proposal Actions V1

## Canonical comparison

Canonical artifact reviewed: `LIFE-OS-CANON-001` v1.2.0.

Classification: **ALIGNED + EXTENSION**.

This transport exposes existing explicit proposal decision services. It does not create a new write model.

- Apply delegates to `applyCalendarPlanProposal`.
- Reject delegates to `rejectRoutingProposal`.
- Apply remains Calendar-only and refuses high-authority approval modes.
- Reject remains a terminal user decision with no canonical Calendar/domain-event write.

## Routes

`POST /api/v1/proposals/:proposalId/apply`

Strict JSON body:

```json
{ "confirmation": { "explicit": true } }
```

`POST /api/v1/proposals/:proposalId/reject`

Strict JSON body is `{}` or `{ "reason": "optional user feedback" }`.

No other client fields are accepted.

## Request authority

The client may supply only the Bearer session credential, proposal identifier, explicit Apply confirmation, and optional Reject reason.

The client cannot choose authenticated user ID, actor type, source, received timestamp, request ID, proposal destination/operation/trust class/state, approval mode, Calendar entity ID, event ID, event payload, or owner scope.

Identity, source, request time and request ID are derived by the trusted backend.

## Processing order

For a recognized route:

1. require POST
2. validate opaque proposal path identifier
3. authenticate Bearer session
4. require uncompressed application/json
5. read a bounded JSON body
6. validate the exact action envelope
7. call the existing application service
8. emit typed privacy-safe operation telemetry
9. return receipt metadata only

Authentication occurs before body validation.

## Domain eligibility remains below HTTP

The HTTP layer never decides whether a proposal is eligible.

`applyCalendarPlanProposal` remains authoritative for ownership, Calendar destination/operation, READY_TO_APPLY state, explicit confirmation, valid Calendar payload, refusal of HIGH_AUTHORITY_APPROVAL, atomic Calendar/domain-event creation, and replay integrity.

`rejectRoutingProposal` remains authoritative for ownership, terminal state, applied proposals not being rejectable, rejection provenance, optional reason normalization/bounds, and same-feedback replay.

## Retry semantics

No transport Idempotency-Key is required. The proposal terminal state is the idempotency anchor.

- repeated Apply after successful Apply replays the stored application receipt
- repeated Reject with the same reason replays stored rejection provenance
- repeated Reject with different feedback is a conflict
- Apply and Reject cannot both become valid terminal outcomes for one proposal

## HTTP outcomes

Shared: 401 authentication_required, generic 404 not_found for unavailable/cross-user proposal, 405 method_not_allowed, 413 request_too_large, 415 unsupported_media_type, 500 internal_error, 503 authentication_unavailable.

Apply: 200 applied, 200 replayed, 400 invalid_request, 409 proposal_not_applicable.

Reject: 200 rejected, 200 replayed, 400 invalid_request, 409 rejection_conflict.

Cross-user and nonexistent proposals use the same generic 404 shape. Provider/database/domain exception messages are never copied to clients.

Technical telemetry must not contain user IDs, source Capture text, rejection reason, session credentials, proposal payload JSON, or exception messages.

## V1 deployment boundary

These routes are isolated server composition only. They are not wired into `apps/api/src/main.ts`, do not configure production auth, do not expose direction/high-authority approval, do not create hosted infrastructure, and do not add client mutation buttons. The running API remains health-only.