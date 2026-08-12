# api

TypeScript application API and modular-monolith composition root. Domain rules should live in shared packages rather than framework handlers.

Current trust-boundary layers include:

- Capture → interpretation → proposal persistence
- owner-scoped proposal review projection
- Proposal → Confirm → Commit transaction service
- `createTrustedWebRequestContext` — converts one verified transport session into server-owned USER identity, `WEB_APP` source, request receipt time, and request ID

Framework/HTTP handlers must remain thin. They may extract an opaque session credential and request body/query values, but they must not construct authoritative user identity, source, request time, or request ID from client-controlled fields.

The authentication context builder is provider-neutral. No production auth adapter, public route, or production secret belongs in this layer yet.
