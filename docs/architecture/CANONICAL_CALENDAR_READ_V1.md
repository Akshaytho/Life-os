# Canonical Calendar Read V1

## Purpose

Expose the Calendar state that Life OS has already committed without mixing canonical facts with Capture text, AI interpretation, proposals, or new mutation authority.

This slice is read-only. It does not confirm proposals, apply proposals, edit Calendar rows, create Calendar rows, or introduce a new database migration.

## Private API

`GET /api/v1/calendar?from=<timestamp>&to=<timestamp>`

The route is part of the existing private API boundary:

1. A normal Supabase user access token is sent only in the `Authorization: Bearer ...` header.
2. The API verifies the session before it validates the requested Calendar range.
3. The verified user ID is bound into PostgreSQL transaction-local RLS scope.
4. The Calendar reader queries only that user's canonical `calendar_event` rows.
5. The response is `private, no-store` and contains canonical Calendar fields only.

POST or other write-looking `/api/v1/calendar` requests remain absent. Calendar creation continues to require the reviewed proposal confirmation + explicit Apply flow.

## Window contract

Both `from` and `to` are required exactly once and must include an explicit UTC offset or `Z`.

The requested window must:

- have `to > from`;
- be no longer than 31 days;
- contain at most 200 overlapping canonical events.

The database reads up to 201 rows so a dense window is rejected instead of silently truncating canonical reality. The caller must narrow the requested window when that guard is reached.

An event overlaps the window when:

`event.starts_at < to AND event.ends_at > from`

This includes events that began before the window but still occupy time inside it.

## Response authority

Every returned item is explicitly projected as `authorityClass: FACT` because it already exists in canonical Calendar state.

The response includes only:

- Calendar event ID;
- title;
- start and end timestamps;
- category;
- commitment;
- canonical commit timestamp;
- `authorityClass: FACT`.

It intentionally excludes:

- authenticated user ID;
- raw Capture text;
- AI observations or explanations;
- proposal payload JSON;
- source proposal ID;
- credentials or provider metadata.

Technical telemetry records only the typed `GET_CANONICAL_CALENDAR` operation, safe request reference, duration, and outcome. It does not receive Calendar content or user identity.

## PostgreSQL proof

Integration coverage creates a synthetic login with only:

- schema `USAGE`;
- `SELECT` on `calendar_event`;
- `EXECUTE` on `lifeos_current_user_id()`;
- no superuser or bypass-RLS authority.

The proof verifies:

- boundary-crossing events are included;
- out-of-window events are excluded;
- another user's event is invisible under the same SQL reader;
- changing the authenticated RLS scope changes the visible Calendar;
- the synthetic read credential cannot insert Calendar rows.

The ordinary hosted Life OS application role remains the existing reviewed runtime role. This synthetic test demonstrates the reader itself needs no write capability; it does not change hosted role privileges in this slice.

## Browser surface

The existing `/calendar` route remains the sample prototype unless all existing browser-safe live-development values are deliberately configured:

- `NEXT_PUBLIC_LIFE_OS_API_BASE_URL`;
- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

When configured, `/calendar` uses the user's Supabase session and reads the next 14 local calendar days from the private canonical API. The live page is read-only and labels returned items as canonical facts.

The sample Calendar lenses remain unchanged when live browser configuration is absent, preserving the current prototype and visual-review baseline.

## Authority boundary

This read surface does not weaken the existing lifecycle:

`Capture → Interpret → Propose → User confirms details → READY_TO_APPLY → User explicitly Applies → canonical Calendar FACT → read here`

AI still cannot create `READY_TO_APPLY` authority by itself, confirmation still does not create Calendar state, and this endpoint cannot mutate anything.

## Scope limits

V1 intentionally does not add Calendar editing, deletion, external calendar synchronization, pagination, recurring-event expansion, or production activation. Those require separate reviewed slices.
