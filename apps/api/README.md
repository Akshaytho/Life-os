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
