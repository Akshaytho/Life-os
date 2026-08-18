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
