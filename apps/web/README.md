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

The web app now has real Supabase browser authentication and authenticated Life OS API flows for Capture/Review/Trace, proposal decisions, canonical Calendar/Today reads, and the separately gated Direction experience.

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

See `docs/architecture/WEB_HOSTED_DEPLOYMENT_V1.md` for the Railway development deployment and exact API CORS activation sequence.

## Trust state

Prototype/sample screens must remain visibly distinct from canonical state. Hosted live mode must not silently fall back to sample data because configuration was omitted. High-authority Direction remains separately gated until its server/database activation has passed hosted verification.
