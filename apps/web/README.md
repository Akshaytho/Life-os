# Life OS Web

Mobile-first React/Next.js client for Life OS.

## Local / prototype mode

Local development defaults to prototype mode so reviewed sample screens and visual-regression fixtures remain available without hosted credentials.

Run from the repository root:

```bash
npm install
npm run dev:web
```

Then open `http://localhost:3000`.

## Live private mode

The web app now has real Supabase browser authentication and authenticated Life OS API flows for Brain Dump/Capture/Review/Trace, explicit NOT NOW decisions, the global **I'm Drifting** and reliable-return flow, proposal decisions, canonical Calendar/Today reads, and the separately gated Direction experience.

A hosted phone-usable deployment must set:

```text
LIFE_OS_WEB_DEPLOYMENT=live
NEXT_PUBLIC_LIFE_OS_API_BASE_URL=<HTTPS Life OS API origin>
NEXT_PUBLIC_SUPABASE_URL=<HTTPS Supabase project origin>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<sb_publishable_...>
NEXT_PUBLIC_LIFE_OS_DIRECTION_ENABLED=false
```

`npm run build --workspace @life-os/web` runs a fail-closed prebuild validator in live mode. Missing/malformed public configuration or non-publishable Supabase key material fails the build.

Health endpoints:

- `/health/live` — Next.js process liveness
- `/health/ready` — HTTP 200 only for a valid explicit `live` deployment

After the external web service has an HTTPS origin, run the read-only hosted web preflight:

```bash
LIFE_OS_WEB_PREFLIGHT_BASE_URL=https://<web-service-origin> \
LIFE_OS_WEB_PREFLIGHT_EXPECT_DIRECTION=dormant \
npm run hosted:preflight --workspace @life-os/web
```

It verifies liveness/readiness, privacy headers and the no-index robots policy using GET requests only. It does not authenticate or read/write Life OS state.

See `docs/architecture/WEB_HOSTED_DEPLOYMENT_V1.md` for the Railway development deployment and exact API CORS activation sequence, and `docs/architecture/WEB_HOSTED_PREFLIGHT_V1.md` for the preflight contract.

## Trust state

Prototype/sample screens must remain visibly distinct from canonical state. Hosted live mode must not silently fall back to sample data because configuration was omitted. High-authority Direction remains separately gated until its server/database activation has passed hosted verification.
