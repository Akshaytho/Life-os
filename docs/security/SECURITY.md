# Security and Privacy Baseline

## Principle

Life OS may eventually contain highly private personal data. Security and privacy are architectural constraints, not a later feature.

## Data Classification

Conceptual levels:

1. Normal — creator techniques, generic tasks
2. Personal — plans, calendar, goals
3. Private — emotional reflections, relationship thoughts, private conversations, major decisions
4. Highly sensitive — future health, financial, identity, or medical records

AI access is context-minimal: possession by Life OS does not imply inclusion in every AI request.

## Environment Rules

- Local/dev use fake or non-sensitive data initially.
- Production uses separate Supabase/Railway projects and credentials.
- Real secrets never enter Git.
- Codex does not require unrestricted production data access.

## Authentication

Use Supabase Auth or an equivalent well-supported authentication path. Sensitive session credentials should not be exposed unnecessarily to browser JavaScript.

### Trusted principal boundary

Canonical writes must never derive the authoritative user ID from request-body, proposal, AI output, MCP payload or other client-controlled fields.

The transport/authentication layer verifies the session and creates a trusted request context containing the authenticated principal. Application services use that principal for canonical ownership and USER event actor identity.

Similarly, event source and authoritative request time come from trusted server/transport context rather than client-provided labels.

A proposal can describe *what* the user wants to change; it cannot declare *who* the authenticated user is.

Authentication proves identity. Authorization must still verify that the principal may act on the referenced proposal/entities before production writes are enabled.

### Session credential handling

The transport credential is opaque application-secret material. The product contract does not require it to be exposed to client JavaScript; a future production adapter may use a secure cookie, bearer credential, or another well-supported mechanism appropriate to the chosen auth provider.

Raw session credentials:

- go only to the session-verification adapter
- never become part of `WriteRequestContext`
- never enter Capture, proposal, Calendar, Memory, or domain-event records
- never enter idempotency fingerprints
- are never echoed in client-facing authentication errors
- must not be sent to Life OS AI, ChatGPT, or MCP tools
- must not be stored in security-audit records

The trusted backend captures authoritative `receivedAt` when the request reaches the transport boundary and generates its own `requestId`. Client fields with the same names have no authority. Capturing request time before potentially slow session verification preserves the original temporal meaning of relative phrases such as “tomorrow.”

An invalid/expired session and an unavailable authentication provider are different operational states. Client-facing errors remain credential-safe, while future security observability may record the category without recording raw credential material.

## Transport and Storage

- HTTPS/TLS for deployed traffic
- encryption at rest through hosting/storage providers
- evaluate field-level application encryption for future highly sensitive text where justified

## MCP / External AI

- scoped access
- read-only by default
- controlled external-analysis submission
- proposals/approval for high-authority changes
- auditable calls
- immediate revocation / disconnect capability

## AI Data Boundary

Retrieved text is data, not executable instruction. External/imported content must not gain authority over system instructions or tool permissions.

AI inference is explicitly labeled and must not silently become canonical fact.

AI-generated payload fields can never substitute for authenticated server identity or authorization context.

## Approval Tiers

High-impact operations always require explicit approval, including direction changes, active-skill changes, major decision supersession, and destructive canonical-memory operations.

## Audit vs Life Timeline

Security audit records are separate from life/domain events.

Security audit examples:

- login success/failure
- permission changes
- MCP tool calls
- exports
- credential/security changes

Security audit records may identify the request/session category or server request ID where appropriate, but must never store raw session credentials.

## Event Integrity

Historical domain events are append-oriented. Corrections create correcting events rather than rewriting ordinary history. User privacy deletion rights remain capable of overriding internal append-only conventions.

Domain-event USER actor identity is derived from authenticated server context for user-authoritative writes, never from an AI/client assertion.

## Backups and Portability

Production should eventually provide encrypted backups and user-controlled export. Life OS must not trap the user's history in a proprietary format.

## Media

Large media should live in object storage or external references rather than relational rows. Analysis records identify the exact media version/checksum they refer to.

## Notification Privacy

Private reflection content should not leak through lock-screen notifications. Notification detail depends on sensitivity.

## AI Independence

Life OS core functions remain usable if AI providers are disabled or unavailable.
