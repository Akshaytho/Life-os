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

## Event Integrity

Historical domain events are append-oriented. Corrections create correcting events rather than rewriting ordinary history. User privacy deletion rights remain capable of overriding internal append-only conventions.

## Backups and Portability

Production should eventually provide encrypted backups and user-controlled export. Life OS must not trap the user's history in a proprietary format.

## Media

Large media should live in object storage or external references rather than relational rows. Analysis records identify the exact media version/checksum they refer to.

## Notification Privacy

Private reflection content should not leak through lock-screen notifications. Notification detail depends on sensitivity.

## AI Independence

Life OS core functions remain usable if AI providers are disabled or unavailable.
