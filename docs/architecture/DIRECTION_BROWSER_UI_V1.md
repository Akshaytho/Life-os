# Direction Browser UI V1

**Canonical artifact reviewed:** `LIFE-OS-CANON-001` v1.2.0  
**Depends on:** `DIRECTION_DECISION_CONTRACT_V1`, `DIRECTION_READ_MODEL_V1`, `DIRECTION_PRIVATE_TRANSPORT_V1`  
**Hosted status:** DORMANT by default — live Direction requires a separate public feature flag after backend activation

## Purpose

Add the first phone-friendly **You / Direction** surface without pretending the high-authority backend is already live.

The user-facing route is:

`/you`

The existing **You** primary-navigation destination now links there.

When Direction activation is not deliberately enabled, `/you` renders an honest dormant state. It does not use sample Direction text and does not ask AI to invent a North Star.

## Live browser gate

Live Direction requires all existing browser-safe API/Auth values plus:

`NEXT_PUBLIC_LIFE_OS_DIRECTION_ENABLED=true`

The extra flag is intentionally separate from the general live-browser configuration because Direction is a high-authority `DECISION` surface.

It must remain false until all of the following are true in the hosted development environment:

1. migration `0007_direction_decision.sql` is applied through the migration runner;
2. the least-privileged application role is deliberately granted the reviewed Direction permissions;
3. private database readiness is updated and passes;
4. the Direction private transport is composed into the runtime;
5. live read/write verification passes.

## Canonical read UX

After a normal Supabase user signs in, the live page reads the Direction overview through the private API and shows:

- current canonical Direction, if one exists;
- `DECISION` authority language;
- decision timestamp;
- superseded/revoked history.

The page does not expose user IDs, request IDs, fingerprints, raw domain events or transport metadata.

If no current Direction exists, the UI says so directly rather than filling the space with a suggestion.

## High-authority decision UX

Changing Direction is intentionally more deliberate than ordinary Capture.

The browser requires:

1. the user writes/edits the exact final statement;
2. the user checks an acknowledgement saying they are choosing it as current Direction;
3. the user presses **Review this decision**;
4. a separate final-review panel displays the exact statement and replacement semantics;
5. only a second action, **Set as current Direction**, sends the canonical mutation.

If the draft or acknowledgement changes after review, the final-review snapshot is invalidated.

The submitted command contains the current Direction ID that the screen observed. The server independently compares it with canonical state, so a stale tab cannot silently supersede a newer decision.

## Retry safety

The browser keeps a retry identity for the exact reviewed decision using `crypto.randomUUID()`.

If network delivery is uncertain, retrying the unchanged reviewed command reuses the same browser key. The server derives the authenticated `DIRECTION_SET_CURRENT` request identity and returns the existing result instead of writing another Direction/event.

Changing the authoritative statement creates a new browser retry identity.

Raw retry keys are not displayed or logged by the UI.

## Session boundary

The page uses the existing browser Supabase client:

- normal user session only;
- persisted/auto-refreshed browser session;
- no service-role credential;
- the API verifies the Bearer token again;
- PostgreSQL RLS remains the ownership boundary.

Signing out clears the rendered Direction state and pending review state.

## Error language

Known private API outcomes are translated into user-facing decision language, including:

- stale current Direction;
- unchanged Direction;
- explicit approval required;
- idempotency conflict/requirement;
- Direction runtime unavailable;
- browser origin not approved;
- network unavailable.

Raw provider/database errors are not displayed.

## Navigation and mobile layout

The existing primary **You** destination is activated as `/you` on desktop and mobile.

The new view is responsive for the repository's reviewed widths, including 390 px and 430 px phone viewports. The final high-authority action becomes full-width on small screens.

Visual Review adds the dormant `/you` page to its screenshot matrix. This proves that default/sample CI visibly says `DORMANT` rather than surfacing fake canonical data.

## What this slice still does not activate

This browser slice does **not** change:

- hosted migration state;
- application-role grants/readiness;
- private runtime composition;
- Railway configuration;
- Supabase settings;
- AI Direction authority;
- ordinary proposal Apply authority.

Therefore merging the browser code does not make live Direction available by itself.

## Activation handoff

After this slice, the remaining Direction activation work is intentionally small and deployment-focused:

1. apply hosted migration `0007`;
2. extend the least-privileged app role/readiness contract;
3. compose the already-reviewed Direction reader + transaction + private handler;
4. verify hosted read, stale-conflict, idempotent retry and zero cross-user visibility;
5. only then set `NEXT_PUBLIC_LIFE_OS_DIRECTION_ENABLED=true` in the web deployment.

At that point Today may begin reading current Direction in a later reviewed composition slice.
