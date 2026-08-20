# api

TypeScript application API and modular-monolith composition root. Domain rules should live in shared packages rather than framework handlers.

Current trust-boundary layers include:

- Capture → interpretation → proposal persistence
- owner-scoped proposal review projection
- Proposal → Confirm → Commit transaction service
- Brain Dump classification and versioned NOT NOW decisions, independently gated from baseline Capture
- explicit Drift recording, versioned understanding, and return decisions, independently gated from every canonical owner
- explicit Journey activation plus append-only practice start/completion evidence, independently gated from baseline runtime authority
- `createTrustedWebRequestContext` — converts one verified transport session into server-owned USER identity, `WEB_APP` source, request receipt time, and request ID

Framework/HTTP handlers must remain thin. They may extract an opaque session credential and request body/query values, but they must not construct authoritative user identity, source, request time, or request ID from client-controlled fields.

The authentication context builder is provider-neutral. No production auth adapter, public route, or production secret belongs in this layer yet.

Brain Dump + NOT NOW remains dormant unless the private API and its separate capability are both enabled. The operator sequence is migration plan/apply, baseline role verification, capability plan/apply, database readiness, and only then runtime activation:

```bash
npm run brain-dump-not-now-role --workspace @life-os/api
npm run brain-dump-not-now-role:apply --workspace @life-os/api
```

The role tool is reversible with `brain-dump-not-now-role:revoke`. These commands use migration credentials; the running API continues to use the non-owner, non-bypass application role.

Drift + Return has the same separate, reversible capability sequence. Immutable occurrence rows receive only `SELECT` + `INSERT`; only versioned decision rows receive the narrow `UPDATE` needed for supersession:

```bash
npm run drift-role --workspace @life-os/api
npm run drift-role:apply --workspace @life-os/api
npm run drift-role:revoke --workspace @life-os/api
```

Journey Activation + Practice remains dormant until migration 0011, the
baseline role, and its append-only capability all pass readiness. All three
Journey tables receive only `SELECT` + `INSERT`:

```bash
npm run journey-practice-role --workspace @life-os/api
npm run journey-practice-role:apply --workspace @life-os/api
npm run journey-practice-role:revoke --workspace @life-os/api
```

## Ask Life OS retrieval

`POST /api/v1/ask` is a separately activated, authenticated, read-only AI boundary.
It assembles a bounded RLS-scoped context package from current Direction, Calendar,
Daily Return, NOT NOW, Drift, and Journey sources. Source domain and authority labels
remain code-owned; the model returns only an AI observation and citations to supplied
source IDs.

Activation requires all of:

- `LIFE_OS_PRIVATE_API_ENABLED=true`
- `LIFE_OS_AI_RETRIEVAL_ENABLED=true`
- `LIFE_OS_AI_RETRIEVAL_MODEL=<explicit reviewed model>`
- `OPENAI_API_KEY=<server-only secret>`
- read readiness for every referenced RLS table

An API key by itself never activates retrieval. Provider requests use `store: false`
and no tools. The operation writes no table or domain event, creates no Memory item,
and returns no invented fallback answer on provider failure.

## Weekly + Monthly Reviews

`GET` and `PUT /api/v1/reviews/period` expose the authenticated period read/write
boundary. Trusted code validates exact Monday–Sunday or calendar-month ranges and
their local-midnight Calendar instants. The read model compresses Daily Return,
Calendar, Journey, Drift, NOT NOW, and current weekly reviews without changing any
source authority. Review answers remain versioned `REFLECTION` rows.

Migration 0012 grants nothing. After the baseline and source capabilities are ready,
the separately reversible review capability can be inspected and deliberately applied:

```bash
npm run periodic-reviews-role --workspace @life-os/api
npm run periodic-reviews-role:apply --workspace @life-os/api
npm run periodic-reviews-role:revoke --workspace @life-os/api
```

`LIFE_OS_PERIODIC_REVIEWS_ENABLED=true` requires the private API plus Daily Return,
Brain Dump + NOT NOW, Drift + Return, and Journey Practice flags. V1 refuses production
activation and performs no automatic Memory promotion or AI-authored submission.

## Memory Activation + Consolidation

`GET /api/v1/memory` retrieves authority-ordered current-owner references, exact
Periodic Review and Journey Practice candidates, current retained Memory versions,
and month → week review compression. `POST /api/v1/memory/items` retains one exact
candidate only after an idempotent user write. `PUT /api/v1/memory/items/:rootId`
creates a new version while preserving history.

Migration 0013 grants nothing. The separately reversible Memory capability grants
only `SELECT`, `INSERT`, and `UPDATE` on the forced-RLS `memory_item` table:

```bash
npm run memory-role --workspace @life-os/api
npm run memory-role:apply --workspace @life-os/api
npm run memory-role:revoke --workspace @life-os/api
```

`LIFE_OS_MEMORY_ENABLED=true` requires the private API plus Direction, Journey
Practice, and Periodic Reviews. V1 refuses production activation. Candidate retention
stays `REFLECTION`, uses no vectors or similarity score, emits no raw text in events,
and never changes a source domain or accepts an AI-authored promotion.
