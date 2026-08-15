# Direction Decision Contract V1

**Canonical artifact reviewed:** `LIFE-OS-CANON-001` v1.2.0  
**Change classification:** ALIGNED + REFINEMENT + EXTENSION  
**Runtime status:** DORMANT — not composed into hosted private routes/readiness yet

## Purpose

Define the first canonical persistence boundary for **current Direction** without giving Life OS AI, ChatGPT, stale browser state, or an ordinary proposal Apply action authority to silently replace what the user has deliberately chosen.

Direction is owned by **You** and is a high-authority `DECISION`. The active Direction answers part of the product question: **Where am I going?**

This slice defines and proves the domain contract, schema, PostgreSQL adapter, transaction semantics, history preservation and concurrency behavior. It deliberately does **not** expose a private HTTP route or live UI yet.

## Canonical doctrine alignment

The contract implements existing doctrine rather than inventing a new ownership rule:

- You owns durable direction and major decisions.
- Direction changes are high-impact operations requiring explicit approval.
- AI may propose a direction reconsideration but must not activate it.
- `DECISION` means an explicit user-authorized commitment.
- superseded decisions remain visible in history.
- canonical current state is stored normally; a corresponding append-oriented domain event preserves chronology.
- derived AI interpretation never silently overwrites canonical state.

The current AI routing policy remains unchanged: `DIRECTION_RECONSIDERATION` routes to `YOU`, targets `REFLECTION`, uses `HIGH_AUTHORITY_APPROVAL`, and remains `NEEDS_CONFIRMATION`. It does not produce an active Direction decision.

## High-authority activation command

The dormant service accepts a user-authored command containing:

- `statement` — the final Direction wording chosen by the user;
- `expectedCurrentDirectionId` — the exact active Direction the user believes they are replacing, or `null` when none exists;
- `approval.explicit = true`;
- `approval.acknowledgement = SET_AS_CURRENT_DIRECTION`.

The authenticated request context supplies the user identity, a stable server-derived write identity, and the decision timestamp.

The service does not take final Direction text from an AI proposal payload. A future UI may prefill/edit suggestions for convenience, but the activation boundary receives the final user-submitted statement and explicit acknowledgement.

## Stable web write identity

A future browser transport must require a strong opaque `Idempotency-Key` and pass the trusted request context through the existing helper:

`withWebWriteIdempotency(context, "DIRECTION_SET_CURRENT", idempotencyKey)`

That helper derives an opaque server-owned request ID from:

- authenticated user ID;
- operation scope `DIRECTION_SET_CURRENT`;
- the raw browser retry key.

The raw key and user ID are hashed into the trusted request identity rather than copied into persistence or responses. The same raw key is isolated both by authenticated user and by operation scope, so a Capture retry key cannot collide with a Direction retry key.

As defense in depth, the Direction activation service accepts only trusted request IDs shaped as:

`web-idem-v1:direction_set_current:<64 lowercase hex characters>`

A fresh ordinary transport request ID is rejected with `IDEMPOTENCY_REQUIRED` before the database unit of work begins. This prevents a future endpoint from accidentally making a high-authority Direction write non-replay-safe.

## Optimistic authority check

A Direction replacement is accepted only when:

`actual current Direction ID == expectedCurrentDirectionId`

This is a semantic compare-and-set rule. It prevents a stale browser tab, delayed request or old suggestion from superseding a newer user decision.

PostgreSQL also obtains a transaction-scoped advisory lock per authenticated user before inspecting current Direction. This serializes the important case where no current row exists yet and ensures two concurrent requests against the same expected version cannot both become active.

## User wording integrity

Direction text is trimmed at the outer boundary only. Internal wording, punctuation and line breaks are preserved.

The backend must not AI-normalize, summarize or rewrite the final user-authored Direction before storing it as a `DECISION`.

## Canonical state and history

Migration `0007_direction_decision.sql` introduces `direction_decision` with lifecycle:

`ACTIVE → SUPERSEDED` or later `REVOKED`

V1 activation supports `ACTIVE` and supersession. Revocation is reserved for a separate reviewed slice.

The table guarantees:

- at most one `ACTIVE` Direction per user;
- historical rows are retained rather than overwritten;
- the new row records which prior Direction it supersedes;
- the supersession foreign key is constrained to the **same user**;
- request idempotency is unique per user, not globally across users;
- statement and identifiers are non-empty and bounded;
- `recorded_at >= decided_at`;
- `ACTIVE` rows cannot have `ended_at` and ended lifecycle rows must have it;
- FORCE RLS is enabled from creation.

## Transactional domain event

Activation and its history mutation occur in the same database transaction as an appended domain event:

- `event_type = DIRECTION_DECISION_ACTIVATED`
- `entity_type = direction_decision`
- `actor_type = USER`
- `actor_id = authenticated user`
- payload trust class = `DECISION`
- payload includes the final user-authored statement and, when present, the superseded Direction ID.

This preserves the ADR-004 state-plus-domain-events model: ordinary screens read canonical current state directly, while chronology remains reconstructable without replaying the entire event stream.

## Idempotency semantics

The persisted request fingerprint covers:

- final Direction statement;
- expected current Direction ID;
- the fixed high-authority acknowledgement.

The stable server-derived request ID identifies the browser retry operation, while the fingerprint verifies that the retry is asking for the exact same authoritative change.

Replaying the same derived request ID with the same fingerprint returns the previously created decision without another write or event.

If that historical decision has since been superseded, replay reports its **actual current lifecycle status (`SUPERSEDED`)** rather than falsely calling it active.

Reusing the same derived request ID with different authoritative content fails with `IDEMPOTENCY_CONFLICT`.

## PostgreSQL authorization proof

Integration coverage uses a synthetic login with only the dormant Direction capabilities needed for the proof:

- schema `USAGE`;
- `SELECT, INSERT, UPDATE` on `direction_decision`;
- `INSERT` on `domain_event`;
- `EXECUTE` on `lifeos_current_user_id()`;
- no superuser or BYPASSRLS authority.

The proof verifies:

- first Direction activation;
- transactional supersession with old history retained;
- USER-authored domain events;
- stale expected-current rejection leaves canonical state unchanged;
- concurrent replacements of the same expected Direction produce exactly one winner;
- RLS/current-state lookup prevents cross-user supersession;
- the same browser Idempotency-Key derives different trusted request IDs for different authenticated users.

## Dormant deployment boundary

This PR intentionally does **not** change:

- `requiredPrivateTables`;
- hosted application-role grants;
- private runtime readiness;
- `createPrivateApiRuntimeDependencies`;
- private API routing;
- browser API clients;
- Today / You UI.

Therefore the ordinary hosted runtime does not gain access to `direction_decision` merely because the schema contract exists in the repository.

Migration `0007` is still part of the normal migration sequence. After it is deliberately applied to the hosted development database, the existing application role remains unprivileged on the new table until a separate reviewed activation slice explicitly changes the role/readiness contract.

A repository containing an unapplied `0007` will correctly show a pending migration in migration/preflight tooling. That is a deployment signal, not an automatic migration.

## Activation sequence after this slice

A later reviewed slice should proceed in this order:

1. apply migration `0007` to the hosted development database using the existing explicit migration tooling;
2. extend the hosted application-role/readiness contract with the minimum Direction privileges;
3. add an authenticated **read** model for current Direction/history;
4. add the dedicated high-authority private activation endpoint, requiring `Idempotency-Key` and deriving the `DIRECTION_SET_CURRENT` trusted request identity before the service call;
5. add a UI that makes the current Decision, proposed change, superseded Decision and explicit acknowledgement visually unmistakable;
6. only then allow live Today to compose current Direction.

The staged approach avoids taking the current Railway private runtime down or granting high-authority write access before the contract is reviewed.

## Post-build comparison target

Before merge, verify again that:

- AI still cannot activate Direction;
- no ordinary proposal Apply path can activate Direction;
- high-authority web writes cannot bypass stable Idempotency-Key derivation;
- user wording is preserved;
- stale/current-version protection is enforced;
- exactly one current Direction can exist per user;
- history and domain event survive supersession;
- cross-user ownership is enforced structurally and by RLS;
- hosted runtime composition and role requirements remain unchanged.
