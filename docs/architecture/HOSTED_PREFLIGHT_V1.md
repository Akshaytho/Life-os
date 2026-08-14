# Life OS — Hosted Preflight V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0
**Classification:** ALIGNED + EXTENSION
**Status:** repository tooling implemented

## Goal

Give the operator one executable answer to the question "is this hosted Life OS
development environment actually safe to point a browser at yet?" without
inventing a new authority model and without writing any private Life OS data.

`DEVELOPMENT_DEPLOYMENT_V1.md` ends its activation sequence with a synthetic
smoke flow before personal data. This is the read-only half of that gate: it
proves the reviewed boundary is live and refuses to be the thing that creates
canonical life state.

## What it verifies

| Check | Meaning |
| --- | --- |
| `HEALTH_LIVE` | the long-running API process is listening on the platform port |
| `HEALTH_READY` | strict private readiness passes, so the connected application role proved the reviewed RLS/ownership boundary |
| `PRIVATE_REQUIRES_AUTHENTICATION` | an unauthenticated private read is refused |
| `PRIVATE_REJECTS_INVALID_CREDENTIAL` | a non-Supabase bearer credential is refused, so the verifier is really consulting Supabase Auth |
| `PRIVATE_REVIEW_READ_SCOPED` | a valid synthetic session reaches an RLS-scoped review read that legitimately finds nothing |
| `PRIVATE_TRACE_READ_SCOPED` | the same for the Interaction & Change Ledger trace read |
| `PRIVATE_UNKNOWN_ROUTE_NOT_FOUND` | the private router does not expose an unreviewed surface |

`READY` requires every check to pass **and** zero private write attempts.

## Zero private writes

The harness is read-only by construction, not by convention:

- the single request helper has no branch that can issue anything but `GET`;
- every request is recorded, and the report carries `privateWriteAttempts`;
- the private identifiers it reads are generated probe ids prefixed
  `lifeos-preflight-absent-`, which satisfy the opaque-id shape but cannot
  correspond to real Life OS state;
- `POST /api/v1/captures` and the proposal `apply`/`reject` routes are never
  requested, and unit tests assert this.

The expected result of both scoped reads is `404`. A `200` there would mean the
probe id matched real state, which is itself a failure worth seeing.

## Secret hygiene

The report contains no base URL, token, connection string, user identifier or
row data. Transport failures are reduced to a fixed sanitized string so provider
hostnames and IP addresses never reach a terminal or CI log. Unit tests assert
the token, the base URL and raw network error text are absent from the report.

## Operator inputs

Both are operator/session inputs supplied at run time. Neither belongs in Git,
in the Railway service variables, or in browser code.

```bash
LIFE_OS_PREFLIGHT_BASE_URL=https://<railway-development-service-host>
LIFE_OS_PREFLIGHT_ACCESS_TOKEN=<short-lived synthetic user access token>
```

The access token must be an ordinary short-lived Supabase **user** access token
for a dedicated synthetic development account. It must not be
`SUPABASE_SERVICE_ROLE_KEY`, and it must not be a token for a real personal
account.

## Running it

```bash
npm run hosted:preflight --workspace @life-os/api
```

Exit code `0` with `"result": "READY"` means the hosted development environment
passed. Any failure exits `1`.

## What it deliberately does not do

- it does not create, migrate or provision anything;
- it does not exercise Capture, proposal apply or proposal reject, because those
  write canonical life state and belong to a separate consented smoke stage;
- it does not verify browser origin/CORS/CSRF policy, which remains a separate
  review before browser mutations are enabled;
- it does not run against production.
