# Calendar Proposal Confirmation V1

## Purpose

Bridge semantic Calendar suggestions to the existing explicit Apply boundary without allowing AI interpretation to create commit-ready authority by itself.

The state flow is:

```text
NEEDS_CONFIRMATION
      ↓ user supplies/accepts complete Calendar details
READY_TO_APPLY
      ↓ separate explicit Apply confirmation
APPLIED
```

Confirmation and Apply are deliberately different actions.

## Confirmation authority

Only an authenticated USER can confirm a proposal through the private API.

V1 accepts only proposals that are already:

- destination `CALENDAR`;
- operation `CREATE_CALENDAR_PLAN`;
- approval mode `EXPLICIT_CONFIRMATION`;
- state `NEEDS_CONFIRMATION`.

High-authority, unsupported-domain, applied, rejected, proposed, or otherwise incompatible proposals cannot be promoted through this boundary.

## Required user-resolved fields

The user must provide all of:

- title;
- start timestamp;
- end timestamp;
- category;
- commitment;
- IANA timezone used while confirming the browser-local time.

Start/end must arrive as absolute ISO timestamps carrying `Z` or an explicit UTC offset. The server normalizes them to UTC before persistence and requires end > start.

The server validates the timezone name but does not use AI to infer timezone.

## Browser behavior

For a Calendar proposal in `NEEDS_CONFIRMATION`, the browser shows `Confirm Calendar details` rather than `Apply`.

Missing values stay empty. The browser does not choose a default category, commitment, or time on behalf of the user.

The browser converts `datetime-local` values using the browser's local timezone and visibly names the detected IANA timezone in the confirmation panel.

After successful confirmation, Review/Trace are reloaded from the server. Only the refreshed `READY_TO_APPLY` proposal exposes the separate `Review Apply` action.

## Persistence without a schema migration

V1 deliberately reuses the existing RLS-protected `routing_proposal.payload_json` and state columns rather than adding another private table.

This avoids a deployment window where strict runtime readiness would require a new table/privilege before hosted migrations and app-role reprovisioning can run.

The confirmed top-level Calendar payload contains the values consumed by the existing Apply boundary. A bounded `confirmation` object stores:

- version;
- confirming user actor id;
- confirmation timestamp;
- trusted request id;
- source;
- IANA timezone;
- deterministic confirmation fingerprint;
- the original interpreted Calendar scalar fields.

Raw Capture text is not copied into confirmation provenance.

## Idempotency and history protection

The confirmation fingerprint covers:

- authenticated user id;
- proposal id;
- normalized confirmed plan including timezone.

If a `READY_TO_APPLY` proposal receives the exact same confirmation again, the server returns the original confirmation as an idempotent replay.

If the second confirmation differs, the server returns a conflict instead of silently overwriting the first user confirmation. Editing an already-confirmed proposal is intentionally deferred to a later reviewed revision flow.

## RLS / transaction boundary

The PostgreSQL adapter executes through `PostgresUserScope`:

1. begin transaction;
2. set `lifeos.user_id` locally;
3. lock the user's Calendar proposal with `FOR UPDATE`;
4. validate state/approval in application code;
5. update payload + `READY_TO_APPLY` only when the row is still `NEEDS_CONFIRMATION`;
6. commit.

No new database table, role privilege, service-role credential, or bypass-RLS path is introduced.

## Relationship to AI interpretation

Trusted AI Interpretation V1 deliberately never emits `READY_TO_APPLY`.

AI may propose partial Calendar fields, but confirmation is the first point where user-supplied/resolved values can make the suggestion complete. This keeps semantic confidence separate from decision authority.

## Relationship to Apply

Confirmation does not create a Calendar event.

The existing Apply endpoint still independently requires:

- authenticated USER;
- same-user RLS proposal access;
- `READY_TO_APPLY`;
- Calendar create operation;
- non-high-authority approval;
- valid complete Calendar fields;
- explicit `{ confirmation: { explicit: true } }`.

Only Apply creates the Calendar row, domain event, and applied-proposal marker atomically.

## Acceptance criteria

- only `NEEDS_CONFIRMATION` Calendar-create / explicit-confirmation proposals can be promoted;
- user identity is established by the normal Supabase session verifier;
- cross-user confirmation is not-found/unavailable;
- no category, commitment, timezone, or missing time is invented by AI/server code;
- timestamps are absolute and normalized to UTC;
- exact retry is idempotent;
- different second confirmation conflicts rather than overwriting provenance;
- original interpreted Calendar scalar fields remain visible in private confirmation provenance;
- no raw Capture duplication into confirmation payload;
- no new schema migration or DB privilege is required;
- real PostgreSQL test proves cross-user RLS refusal, confirmation, exact replay, and subsequent existing Apply transaction;
- browser requires confirmation before showing Apply;
- Review/Trace reload after confirmation;
- CI, behavior regression/baseline, and visual review remain green.
