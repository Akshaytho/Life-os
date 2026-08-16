# Direction Read Model V1

**Canonical artifact reviewed:** `LIFE-OS-CANON-001` v1.2.0  
**Builds on:** `DIRECTION_DECISION_CONTRACT_V1`  
**Runtime status:** DORMANT — no hosted role grant, private route, browser client or live Today composition

## Purpose

Define the first private read model for canonical Direction so Life OS can eventually answer **Where am I going?** from explicit user decisions without treating AI suggestions, proposal text or technical persistence metadata as authoritative Direction.

This slice is deliberately read-only and dormant. It prepares the domain/service/PostgreSQL boundary while leaving the current hosted application role and private runtime unchanged.

## User-visible model

The read result contains:

- `current` — zero or one `ACTIVE` Direction decision;
- `history` — up to 100 ended Direction decisions in newest-first order;
- every returned item is visibly `authorityClass = DECISION`.

Current Direction exposes only:

- decision ID;
- exact stored user wording;
- `ACTIVE` status;
- `DECISION` authority class;
- decision time.

History exposes only:

- decision ID;
- exact stored user wording;
- `SUPERSEDED` or `REVOKED` status;
- `DECISION` authority class;
- decision time;
- end time.

The read model intentionally omits:

- authenticated user ID;
- request ID;
- request fingerprint;
- database recorded time;
- correlation/transport details;
- migration metadata;
- internal supersession foreign-key details.

Those fields are persistence or transport provenance, not the user-facing answer to where the user is going.

## Authority and wording

Direction remains owned by **You**.

The read model never converts AI observations or suggestions into Direction. It reads only canonical `direction_decision` rows created through the separate high-authority activation boundary.

Stored Direction wording is projected exactly as stored. The read service does not summarize, normalize, rewrite or AI-edit the user's decision text.

## RLS and least privilege

`PostgresDirectionDecisionReader` enters the existing transaction-local authenticated user scope before querying `direction_decision`.

The SQL still includes `WHERE user_id = $1`, while PostgreSQL FORCE RLS independently enforces the same ownership boundary through `lifeos_current_user_id()`.

Integration proof uses a synthetic role with only:

- schema `USAGE`;
- `SELECT` on `direction_decision`;
- `EXECUTE` on `lifeos_current_user_id()`;
- no superuser or BYPASSRLS authority;
- no Direction `INSERT`, `UPDATE` or `DELETE` privileges.

Without a bound authenticated user the role sees zero Direction rows.

## Fail-closed projection

The application read service refuses to project canonical Direction when:

- the authenticated principal is empty;
- a reader returns a row owned by a different user;
- more than one active Direction appears;
- an `ACTIVE` row carries an end time;
- a `SUPERSEDED` or `REVOKED` row lacks a valid end time;
- decision timestamps are invalid;
- more than 100 historical decisions would need to be silently truncated.

V1 deliberately rejects excessive history rather than pretending an incomplete list is complete. Pagination can be introduced in a later reviewed read-model version.

## Dormant deployment boundary

This slice intentionally does **not** change:

- migration history or migration `0007`;
- `requiredPrivateTables`;
- hosted application-role grants;
- private database readiness;
- `createPrivateApiRuntimeDependencies`;
- private API routing;
- CORS surface;
- browser API client;
- Today / You live UI.

Therefore merging this read model does not make Direction readable from the current Railway service.

The hosted activation order remains:

1. deliberately apply migration `0007_direction_decision.sql` to the development database;
2. explicitly extend the application-role/readiness contract with the reviewed minimum Direction privileges;
3. compose this reader into authenticated private runtime dependencies;
4. add a dedicated private Direction read route;
5. only then connect a live user interface.

The high-authority Direction write endpoint remains a separate later slice and must continue requiring explicit `SET_AS_CURRENT_DIRECTION` acknowledgement plus stable `DIRECTION_SET_CURRENT` Idempotency-Key derivation.

## Validation target

Before merge, prove:

- user wording is preserved exactly;
- only canonical `DECISION` rows are projected;
- user/request/fingerprint metadata is absent from the response model;
- cross-user state cannot be returned;
- malformed lifecycle state fails closed;
- history is bounded without silent truncation;
- real PostgreSQL FORCE RLS isolates users;
- the synthetic read credential cannot write Direction;
- ordinary hosted application-role/readiness/runtime composition remain unchanged.
