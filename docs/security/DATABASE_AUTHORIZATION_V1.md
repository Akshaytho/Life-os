# Life OS — Database Authorization V1

**Canonical artifact reviewed:** `LIFE-OS-CANON-001` v1.1.0  
**Security baseline reviewed:** `docs/security/SECURITY.md`  
**Change classification:** ALIGNED + EXTENSION  
**Status:** PostgreSQL defense-in-depth authorization proof; no production deployment

## Product question

How can PostgreSQL reject cross-user reads and writes even if trusted backend SQL accidentally forgets an ownership predicate?

## Boundary

Authentication and database authorization remain separate layers:

```text
UNTRUSTED WEB REQUEST
        ↓
SESSION VERIFICATION
        ↓
TRUSTED USER ID
        ↓
BACKEND DATABASE TRANSACTION
  set transaction-local lifeos.user_id
        ↓
NON-OWNER APPLICATION ROLE
        ↓
POSTGRESQL ROW LEVEL SECURITY
  row owner must equal lifeos.user_id
```

The browser never receives the application database role and never sets PostgreSQL session context directly.

## What RLS protects against

RLS is defense-in-depth for trusted backend mistakes such as:

- a repository query accidentally omitting `WHERE user_id = ...`
- a broad `SELECT *` against a private table
- an update/delete statement that forgets its ownership predicate
- an insert attempting to persist a row for a different user than the authenticated scope

The policy makes those mistakes fail closed at PostgreSQL.

## What RLS does not claim to protect against

This V1 does not claim that RLS can defend against a fully compromised trusted backend that intentionally binds another user's ID. The backend owns the database credential and is therefore part of the trusted computing base.

Accordingly:

- untrusted clients never receive direct database credentials
- the production application role must be non-superuser, non-table-owner, and must not have `BYPASSRLS`
- authenticated user identity must come from the trusted transport/auth boundary
- application approval rules still apply before canonical mutation
- RLS does not replace application authorization, proposal approval, provenance, or transaction invariants

## Provider-neutral database identity context

Core schema does not call Supabase-specific `auth.uid()`.

Instead the backend binds the already-verified user ID to a transaction-local PostgreSQL setting:

`lifeos.user_id`

Policies read it through `lifeos_current_user_id()`.

This keeps the domain/database contract independent of the eventual authentication provider while remaining compatible with a future Supabase deployment.

## Transaction-local rule

User scope is set with PostgreSQL `set_config(..., true)`, where `true` means transaction-local.

Therefore:

- identity context does not intentionally survive COMMIT or ROLLBACK
- pooled connections do not carry one user's scope into another transaction
- every private database transaction must bind its authenticated user explicitly
- blank user IDs are rejected before a scope is created

`PostgresUserScope` is the provider-neutral adapter for this rule.

## Tables protected

V1 enables and forces RLS on:

- `capture_record`
- `routing_interpretation`
- `routing_proposal`
- `calendar_event`
- `domain_event`
- `applied_proposal`

The first five use their canonical `user_id` column.

`applied_proposal` currently has no separate `user_id`; its policy requires both:

- `confirmed_by_actor_id = lifeos_current_user_id()`
- the referenced `routing_proposal` belongs to the same current user

This preserves the existing schema while keeping the applied marker tied to real proposal ownership.

## Policy behavior

Each owner policy uses both:

- `USING (...)` for SELECT / UPDATE / DELETE visibility
- `WITH CHECK (...)` for INSERT / UPDATE target ownership

No bound user means `lifeos_current_user_id()` returns NULL and private rows fail closed.

## FORCE ROW LEVEL SECURITY

Policies are enabled with `FORCE ROW LEVEL SECURITY` so ordinary table ownership is not accidentally treated as the application authorization mechanism.

PostgreSQL superusers and roles with `BYPASSRLS` can still bypass row policies by design. Production application credentials therefore must never use those capabilities.

CI proves the policies by switching to a dedicated non-superuser, non-`BYPASSRLS`, non-owner test role.

## Applied marker note

The applied marker remains subordinate to the existing Proposal → Confirm → Commit transaction. RLS does not make an applied proposal authoritative; it only limits which authenticated user scope may see/create/update its row.

## Pre-build canonical comparison

- **ALIGNED:** authenticated ownership remains server-derived.
- **ALIGNED:** private data access is scoped to the authenticated user.
- **ALIGNED:** PostgreSQL remains canonical structured storage.
- **ALIGNED:** approval/provenance rules remain application/domain responsibilities.
- **ALIGNED:** no browser or AI receives direct database authority.
- **ALIGNED:** no Supabase-specific identity primitive is frozen into core schema.
- **EXTENSION:** adds PostgreSQL row-level authorization as defense-in-depth.
- **NO CONFLICT:** no navigation ownership, AI role, trust class, approval rule, or production credential decision changes.
