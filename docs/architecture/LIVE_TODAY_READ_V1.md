# Live Today Read V1

## Purpose

Replace the live-development home screen's sample assumptions with a narrow view of what Life OS can currently prove from canonical state.

V1 derives Today only from the authenticated canonical Calendar read introduced in Canonical Calendar Read V1. It adds no new API endpoint, database table, migration, privilege, or write path.

## Live-development feature gate

The root `/` route remains the existing Today sample prototype unless all current browser-safe live-development values are deliberately configured:

- `NEXT_PUBLIC_LIFE_OS_API_BASE_URL`;
- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

When those values exist, `/` renders the live Today read surface. This preserves the existing prototype and visual baseline by default.

## Source of truth

Live Today requests exactly the user's local calendar day through:

`GET /api/v1/calendar?from=<local-midnight-as-ISO>&to=<next-local-midnight-as-ISO>`

The existing private Calendar boundary still performs Supabase session verification, PostgreSQL RLS scoping, bounded-window validation, and FACT-only response projection.

Today does not receive raw Capture text, AI interpretation, proposal payloads, user IDs, or mutation authority.

## Deterministic Today derivations

The browser derives only values that follow directly from the returned canonical Calendar facts plus the browser's local clock:

- event happening now, if the clock is within a canonical event interval;
- next canonical event whose start is still ahead;
- chronological list of today's canonical events;
- number of events completed by the current clock;
- number of events still ahead;
- occupied time computed as the union of canonical event intervals clipped to the requested local day.

Overlapping Calendar events are merged before occupied time is totaled, so overlap is not double-counted.

The local clock updates once per minute. When the local calendar date changes, Today automatically requests the new local-day window instead of continuing to present yesterday's fetched state.

## Missing domains stay missing

The sample Today prototype includes concepts such as direction, focus signals, creator Journey progress, Memory, and AI guidance. Live Today V1 intentionally does not project those concepts because their canonical read models do not exist yet.

The live surface explicitly says those areas are unavailable rather than substituting sample values or AI guesses. Future domains should appear only after their own persisted trust/authority contracts and read boundaries are reviewed.

## Authority boundary

Live Today is read-only.

It cannot:

- create or edit Calendar events;
- confirm Calendar proposal details;
- Apply or Reject proposals;
- write direction, Memory, Journey, focus, or guidance state;
- turn AI output into canonical facts.

Navigation links lead to the separate live Calendar and Capture/Review surfaces where those already-reviewed capabilities belong.

## Scope limits

V1 does not yet provide a full Life OS Today model. It is a truthful canonical Calendar slice of Today. Direction, Journey, Memory, broader domain state, cross-domain prioritization, and AI guidance require separate reviewed slices.
