# Web Hosted Development Deployment V1

**Purpose:** turn the existing mobile-responsive Life OS web application into a real hosted development URL without silently serving prototype/sample mode.

**Environment:** development only. Production deployment remains a separate reviewed decision.

## Deployment model

Life OS is a shared npm monorepo. The web app imports contracts from `packages/contracts`, so the hosted web service must build from the **repository root** rather than isolating `apps/web` as its only checkout root.

Use workspace-specific commands:

Build:

`npm run build --workspace @life-os/web`

Start:

`npm run start --workspace @life-os/web`

`next start` reads the platform-provided `PORT`; no custom Node HTTP server is required.

## Live deployment mode

Hosted phone use must set:

`LIFE_OS_WEB_DEPLOYMENT=live`

Local screenshots/prototypes may omit it or use `prototype`.

The web workspace has a `prebuild` validation step. In `live` mode the build fails unless all browser configuration below is valid. This prevents a hosted service from quietly falling back to sample/prototype components because an environment variable was forgotten.

## Browser-safe required variables

A live web build requires:

- `LIFE_OS_WEB_DEPLOYMENT=live`
- `NEXT_PUBLIC_LIFE_OS_API_BASE_URL=<exact HTTPS API origin>`
- `NEXT_PUBLIC_SUPABASE_URL=<exact HTTPS Supabase project origin>`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<sb_publishable_... browser key>`
- `NEXT_PUBLIC_LIFE_OS_DIRECTION_ENABLED=false` initially

The origin values must be pure HTTPS origins: no credentials, path, query string or fragment.

The browser-key variable accepts Supabase's current `sb_publishable_...` format only. `sb_secret_...`, legacy service-role material and arbitrary strings fail the hosted build.

Never add any of the following to the web service:

- `DATABASE_URL`
- `MIGRATION_DATABASE_URL`
- `LIFE_OS_APPLICATION_DB_PASSWORD`
- `SUPABASE_SERVICE_ROLE_KEY`
- a Supabase secret key
- synthetic-user passwords or access tokens
- `OPENAI_API_KEY`

Those do not belong in browser-delivered infrastructure.

## Build-time public configuration

`NEXT_PUBLIC_*` values are browser-delivered build configuration. Treat a change to one of these values as a new web build/deploy, not as a server-only runtime toggle.

This matters particularly for:

`NEXT_PUBLIC_LIFE_OS_DIRECTION_ENABLED`

The Direction browser surface must remain false until the Direction server capability and hosted database privilege/readiness checks are already verified.

## Web health contract

The web app exposes:

`GET /health/live`

Expected:

- HTTP 200
- `{ "status": "ok" }`

This only proves the Next.js process is alive.

It also exposes:

`GET /health/ready`

A phone-usable hosted deployment is ready only when:

- deployment mode is `live`;
- API origin is valid HTTPS;
- Supabase origin is valid HTTPS;
- browser key is a publishable key;
- Direction public flag is a valid boolean.

Expected successful response:

```json
{
  "status": "ready",
  "mode": "live",
  "direction": "dormant"
}
```

or, after reviewed Direction activation:

```json
{
  "status": "ready",
  "mode": "live",
  "direction": "enabled"
}
```

Prototype mode intentionally returns HTTP 503 from `/health/ready`. Therefore the hosted platform should use `/health/ready` as the web service deployment healthcheck.

The readiness receipt never exposes configured origins or key material.

## Search-index privacy

The development web app sends:

`X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`

and publishes a `robots.txt` rule disallowing all crawling.

This is defense in depth only. It does not replace authentication. Private Life OS state remains protected by Supabase user sessions, the API authentication boundary and PostgreSQL RLS.

## Railway development service

Create a second service in the existing **development** Railway project, connected to the same GitHub repository and default branch.

Recommended service name:

`@life-os/web`

Use repository root / shared-monorepo mode. Do **not** set Root Directory to `apps/web`, because the web package imports shared repository packages.

Configure:

Build command:

`npm run build --workspace @life-os/web`

Start command:

`npm run start --workspace @life-os/web`

Healthcheck path:

`/health/ready`

Generate a Railway HTTPS public domain after variables are configured.

## Required deployment order

### 1. Deploy web with Direction dormant

Configure the live web variables, keeping:

`NEXT_PUBLIC_LIFE_OS_DIRECTION_ENABLED=false`

Deploy and require `/health/ready` = 200 `ready`.

### 2. Obtain the exact web HTTPS origin

After Railway generates the domain, record only its origin, for example:

`https://<web-service-domain>`

No path or trailing application route belongs in the CORS allowlist.

### 3. Update API CORS

Add the exact web origin to the API service's:

`LIFE_OS_CORS_ALLOWED_ORIGINS`

Preserve any existing deliberately allowed development origins. Do not use `*`.

Redeploy the API and require its normal liveness/readiness + hosted preflight to remain READY.

### 4. Verify baseline phone flow before Direction

From a real phone browser over HTTPS:

1. open the web domain;
2. sign in using the normal development Supabase user flow;
3. Capture a synthetic/non-personal test statement;
4. verify persisted Review/Trace;
5. exercise Reject or a reviewed Calendar confirmation/apply flow;
6. verify canonical Calendar and Today read back the committed fact;
7. sign out and verify private state is no longer rendered.

Do not introduce real personal data until this hosted browser boundary is trusted.

### 5. Activate Direction separately

Only after baseline phone use works:

1. apply migration `0007` through the explicit migration runner;
2. verify baseline application DB role plan is READY;
3. run Direction role plan/apply;
4. enable API `LIFE_OS_DIRECTION_ENABLED=true`;
5. deploy API and require `/health/ready`;
6. run ordinary hosted preflight;
7. run `hosted:preflight:direction` and require READY + zero writes;
8. then set web `NEXT_PUBLIC_LIFE_OS_DIRECTION_ENABLED=true`;
9. rebuild/redeploy web;
10. verify `/you` on the phone before using a real Direction decision.

## CI proof

Life OS CI validates the hosted web path with synthetic public configuration:

- deployment configuration unit tests;
- live-mode prebuild validation;
- production Next.js build;
- production `next start` using a platform-style `PORT`;
- `/health/live` smoke;
- `/health/ready` smoke.

Visual Review remains in prototype mode so screenshots cannot accidentally depend on real hosted services or credentials.

## Rollback

If the hosted web deployment is unhealthy:

1. leave the API and database unchanged;
2. turn off or roll back the web service;
3. remove its origin from API CORS if the domain is abandoned;
4. keep Direction browser exposure false.

If only Direction needs rollback, follow the separate Direction activation rollback sequence; baseline Capture/Calendar/Today web use can stay live.
