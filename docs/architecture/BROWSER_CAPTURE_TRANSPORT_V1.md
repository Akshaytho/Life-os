# Browser Capture Transport V1

**Canonical artifact reviewed:** `LIFE-OS-CANON-001` v1.2.0  
**Product surface reviewed:** `docs/product/CAPTURE_REVIEW_UI_V1.md`  
**Change classification:** ALIGNED + EXTENSION  
**Environment:** local / development only

## Purpose

Connect the existing Capture Review trust surface to the reviewed private API without changing the Life OS authority model.

The live browser path is:

```text
Supabase user session
        ↓ Bearer token
POST /api/v1/captures
        ↓
persist exact USER SOURCE + OBSERVATION + SUGGESTION
        ↓
GET /api/v1/captures/:id/review
GET /api/v1/interactions/:id/trace
        ↓
render persisted review
        ↓
STOP — approval/apply remains disconnected
```

Capture persistence is not a canonical life-state mutation. Calendar, Journey, Memory, You and other owning domains remain unchanged until a separately reviewed user-authority action is performed.

## Browser authentication

The web app uses the browser-safe Supabase client with:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The normal user access token is sent to Life OS only through the `Authorization: Bearer` header. It is never rendered into the UI or intentionally logged.

The API remains responsible for verifying the session. Browser session state never becomes trusted identity by itself.

V1 uses bearer authentication rather than cookies, so this slice does not introduce a cookie/CSRF authority path.

## Private API origin policy

`LIFE_OS_CORS_ALLOWED_ORIGINS` is a comma-separated list of exact browser origins.

Rules:

- only `http` / `https` origins;
- no credentials, paths, query strings or fragments;
- no wildcard;
- no `Access-Control-Allow-Credentials`;
- allowed private methods are `GET` and `POST`;
- allowed browser request headers are `Authorization`, `Content-Type`, and `Idempotency-Key`;
- requests without `Origin` continue to work for server-side operators and the hosted preflight;
- a browser `Origin` not on the allowlist is rejected before private authentication;
- health routes remain outside the private CORS policy.

When the variable is absent, the allowlist is empty. This is intentionally fail-closed for browser access while preserving existing non-browser hosted verification.

## Capture write safety

The browser generates one opaque idempotency key for each in-flight Capture attempt.

If the browser cannot determine whether a request completed, retrying the same attempt reuses the same key. Once the server returns a Capture receipt, that attempt is complete and a later submission gets a new key.

The existing private Capture endpoint still owns:

- authenticated user context;
- 800-character source limit;
- request validation;
- server-side user-bound idempotency derivation;
- Safe Fallback interpretation when no trusted semantic interpreter is enabled;
- transaction boundaries and RLS-scoped persistence.

No browser code receives direct PostgreSQL credentials or Supabase service-role authority.

## Review and trace

After a Capture receipt, the browser reads the persisted `CaptureProposalReview` and `InteractionChangeTrace` through the same authenticated private API.

The UI continues to distinguish:

- `YOU SAID · USER SOURCE`
- `LIFE OS SAW · OBSERVATION`
- `LIFE OS PROPOSES · SUGGESTION`
- proposed `IF APPROVED` result class

Changing the draft after submission does not rewrite the review that belongs to the previously persisted source.

## Explicitly out of scope

V1 does **not** wire:

- proposal Apply;
- proposal Reject;
- high-authority confirmation UI;
- cookie authentication;
- service-role access;
- production activation;
- an LLM semantic interpreter;
- unrestricted browser access to other Life OS surfaces.

Those remain separate reviewed slices.

## Web feature gate

The existing sample Capture prototype remains the default unless all three public browser values are present:

```text
NEXT_PUBLIC_LIFE_OS_API_BASE_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

This keeps CI, visual regression and unconfigured local development on the deterministic sample UI. A hosted web deployment must also have its exact origin added to the API-side `LIFE_OS_CORS_ALLOWED_ORIGINS` list.

## Acceptance checks

- no wildcard CORS;
- disallowed browser origin is rejected before authentication;
- allowed preflight exposes only reviewed methods/headers;
- private auth responses preserve exact `Access-Control-Allow-Origin`;
- health routes do not inherit private CORS;
- browser-safe config contains no service-role or database credential;
- Capture uses a user access token plus an idempotency key;
- persisted Review and Trace are loaded after Capture;
- exact source remains visually separate from observation/suggestion;
- Apply/Reject remain disconnected;
- sample UI remains the default when live browser config is absent;
- existing API tests, integration tests, behavior gates and web build remain green.

## Canonical comparison

- **ALIGNED:** raw Capture remains the user-authored source.
- **ALIGNED:** interpretation remains OBSERVATION.
- **ALIGNED:** proposals remain SUGGESTION until explicit authority is supplied.
- **ALIGNED:** browser identity is untrusted until the API verifies the Supabase user session.
- **ALIGNED:** PostgreSQL/RLS remains the final data-isolation boundary.
- **ALIGNED:** technical telemetry remains separate from the user-visible Interaction & Change trace.
- **EXTENSION:** the existing read-only Capture Review prototype gains authenticated persistence/read transport.
- **NO CONFLICT:** proposal application authority is not widened and canonical domain mutation is not added to this screen.
