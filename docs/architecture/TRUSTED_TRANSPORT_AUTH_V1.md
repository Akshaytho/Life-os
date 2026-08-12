# Life OS — Trusted Transport Authentication V1

**Canonical artifact reviewed:** `LIFE-OS-CANON-001` v1.1.0  
**Security baseline reviewed:** `docs/security/SECURITY.md`  
**Change classification:** EXTENSION + REFINEMENT  
**Status:** transport/authentication port contract; no production auth provider

## Product question

How does an incoming web request become a trusted Life OS principal without allowing the browser, proposal payload, AI output, or transport metadata supplied by the client to declare who the user is?

## Boundary

```text
UNTRUSTED WEB REQUEST
      │
      ├─ opaque session credential
      ├─ arbitrary body/query/header data
      │
      ▼
TRANSPORT AUTH BOUNDARY
      │
      ├─ verify credential through SessionVerifier
      ├─ capture server clock
      ├─ generate server request ID
      └─ bind source = WEB_APP
      │
      ▼
TRUSTED REQUEST CONTEXT
      ├─ principal.userId       verified
      ├─ principal.actorType    USER
      ├─ source                 WEB_APP
      ├─ receivedAt             server clock
      └─ requestId              server generated
```

Only the trusted context may feed application services that read or mutate private Life OS data.

## Credential rule

The credential is an opaque transport secret. V1 does not choose whether production uses a secure cookie, bearer token, or another well-supported session mechanism.

The credential:

- is passed only to the session-verifier port
- is not copied into `WriteRequestContext`
- is not copied into Capture, proposal, domain-event, memory, or Calendar records
- is not echoed in authentication error messages
- is not part of application idempotency fingerprints
- is not written to the user's life timeline

Future security audit logging must likewise avoid storing raw credentials.

This keeps the contract compatible with the security requirement that sensitive session credentials should not be exposed unnecessarily to browser JavaScript.

## Session verifier port

`SessionVerifier` accepts one opaque credential and either:

- returns a verified user session containing a non-empty user ID; or
- returns `undefined` when the credential is absent/invalid/expired according to the provider adapter; or
- throws when the authentication provider itself is unavailable.

The application boundary converts those outcomes into two deliberately different failures:

- `AuthenticationRequiredError` — no usable authenticated session
- `AuthenticationUnavailableError` — identity could not be checked because the verifier/provider failed

Provider exceptions are not passed through verbatim because they may contain transport/provider details. The raw credential is never included in either error.

## Server-owned metadata

The browser cannot choose:

- authenticated `userId`
- actor type
- Life OS source label
- authoritative request time
- request ID

Those values are derived after the request reaches the trusted backend boundary.

`receivedAt` is captured from the backend clock. `requestId` is created by a server-side generator. Extra client fields named `userId`, `principal`, `source`, `receivedAt`, or `requestId` have no authority.

## Authentication vs authorization

Authentication answers: **who is this request?**

Authorization answers: **may this verified user access or change this referenced Life OS resource?**

V1 implements only the authentication-context port. Existing proposal/read services already scope stored resources by the authenticated user ID, but production authorization/RLS remains a separate required layer before real endpoints are enabled.

## Read and write reuse

The same verified principal can supply:

- `WriteRequestContext` for Capture creation and later Apply
- read context for proposal review and future private reads

This prevents the read path and write path from developing different identity rules.

## AI boundary

AI output can never create or alter the authenticated principal. An AI/provider may interpret *what* the user wants, but the transport/auth layer alone establishes *who* is making the request.

No AI provider receives the raw session credential.

## Environment boundary

This slice provides:

- TypeScript ports
- trusted-context builder
- deterministic fake verifier tests

It does **not** provide:

- Supabase Auth network calls
- cookies/JWT parsing
- deployed middleware
- real user sessions
- authorization/RLS
- public HTTP routes
- production secrets

## Pre-build canonical comparison

- **ALIGNED:** canonical identity never comes from request body/proposal/AI fields.
- **ALIGNED:** authentication precedes private application access.
- **ALIGNED:** sensitive credentials are minimized and excluded from domain data.
- **ALIGNED:** trusted server context owns event source and authoritative request time.
- **ALIGNED:** authentication and authorization remain distinct responsibilities.
- **ALIGNED:** AI gains no identity or database authority.
- **REFINEMENT:** makes the previously documented trusted-principal rule executable at the transport boundary.
- **EXTENSION:** adds provider-neutral session-verifier and server request-metadata ports.
- **NO CONFLICT:** no production provider, auth UX, canonical domain ownership, or approval rule changes.
