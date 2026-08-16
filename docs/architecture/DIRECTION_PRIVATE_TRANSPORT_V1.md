# Direction Private Transport V1

**Canonical artifact reviewed:** `LIFE-OS-CANON-001` v1.2.0  
**Depends on:** `DIRECTION_DECISION_CONTRACT_V1`, `DIRECTION_READ_MODEL_V1`, `TRUSTED_TRANSPORT_AUTH_V1`, `WEB_WRITE_IDEMPOTENCY_V1`  
**Runtime status:** DORMANT — isolated handler/server only; not composed into hosted private routing

## Purpose

Define the authenticated browser HTTP boundary for canonical Direction without making that high-authority capability reachable from the currently deployed Railway runtime.

The transport exposes two reviewed operations in isolation:

- `GET /api/v1/direction` — read the authenticated user's current Direction and bounded history;
- `POST /api/v1/direction/current` — submit the user's final current-Direction decision.

This slice deliberately stops before runtime composition, hosted database-role grants, browser client wiring or Today composition.

## Authority model

Direction remains owned by **You** and remains a `DECISION`.

The mutation transport does not convert an AI proposal directly into canonical Direction. Its body contains the final user-submitted statement plus:

- `expectedCurrentDirectionId` — compare-and-set protection against stale browser state;
- `approval.explicit = true`;
- `approval.acknowledgement = SET_AS_CURRENT_DIRECTION`.

The application service remains the authority validator. The transport cannot weaken or bypass those checks.

## Authentication before semantic details

Both reviewed routes resolve the Supabase-backed trusted web request context before reading private state or parsing mutation content.

Therefore an unauthenticated caller receives the authentication boundary without learning whether:

- a Direction reader is configured;
- a Direction mutation store is configured;
- a submitted Direction body is syntactically or semantically valid.

Provider exceptions remain sanitized as `authentication_unavailable`.

## Stable mutation identity

`POST /api/v1/direction/current` requires the existing opaque `Idempotency-Key` browser header.

After authentication, the transport derives the trusted write identity with:

`withWebWriteIdempotency(context, "DIRECTION_SET_CURRENT", idempotencyKey)`

The raw retry key and authenticated user ID are hashed into the server-owned request ID. They are not copied into responses or telemetry.

The high-authority service independently requires the derived request ID shape, preserving defense in depth if a future caller tries to invoke it incorrectly.

## Strict request shape

The mutation request must be JSON with exactly:

- `statement`;
- `expectedCurrentDirectionId`;
- `approval` containing exactly `explicit` and `acknowledgement`.

Unknown top-level or approval fields are rejected. Compressed request bodies are not accepted by this V1 parser, and the body is bounded to 8 KiB.

This avoids accepting ambiguous authority metadata such as client-supplied AI approval flags or arbitrary policy fields.

## Sanitized response semantics

The read response contains only the existing Direction overview contract: user-visible decision text, lifecycle, authority class and timestamps.

The mutation success response contains only:

- `status = active | replayed`;
- `directionId`;
- `authorityClass = DECISION`;
- `decidedAt`;
- optional `supersededDirectionId`.

Expected conflict responses include stable status codes for:

- explicit approval required;
- current Direction changed;
- unchanged Direction;
- idempotency conflict;
- missing/invalid idempotency;
- invalid Direction request.

Raw database/provider errors, user IDs, request fingerprints, credentials and arbitrary error messages are never returned.

## Telemetry boundary

Two technical operation names are added:

- `GET_DIRECTION_OVERVIEW`;
- `SET_CURRENT_DIRECTION`.

Operation telemetry may carry the server-owned request ID, but the schema still does not permit raw Direction text, arbitrary payloads, credentials or user IDs.

## CORS compatibility

No CORS surface is expanded by this slice.

The reviewed private browser policy already permits only `GET` and `POST` and only the headers required by current private browser flows, including `Authorization`, `Content-Type` and `Idempotency-Key`.

The chosen Direction routes fit inside that existing boundary.

## Dormant deployment boundary

This slice deliberately does **not** change:

- hosted migration state;
- `requiredPrivateTables`;
- application-role Direction grants;
- private database readiness;
- `createPrivateApiRuntimeDependencies`;
- the main private router;
- Railway environment configuration;
- browser `life-os-api` client;
- Today / You UI.

Therefore merging this code cannot make Direction reachable in the current hosted runtime.

## Validation target

Transport tests prove:

- authenticated read binds ownership to the verified user;
- response/telemetry omit internal identity and persistence metadata;
- authentication occurs before malformed mutation parsing;
- stable `DIRECTION_SET_CURRENT` idempotency is mandatory;
- exact retry is replay-safe without duplicate decision/event writes;
- changed content under the same retry key conflicts;
- explicit approval cannot be weakened;
- stale expected-current ID is rejected without mutation;
- unknown authority fields are rejected;
- missing Direction dependencies fail closed after authentication;
- only reviewed GET/POST methods are exposed by the isolated handler.

The handler remains dormant until a later activation slice deliberately applies migration `0007`, extends the hosted role/readiness contract and composes the transport into the private runtime.
