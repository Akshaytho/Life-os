# Direction Hosted Preflight V1

**Depends on:** `HOSTED_PREFLIGHT_V1`, `DIRECTION_ACTIVATION_SWITCH_V1`  
**Mutation authority:** NONE — GET-only hosted verification

## Purpose

Verify the real hosted Direction read boundary after the high-authority capability is activated, without creating a synthetic Direction decision merely to prove deployment.

The ordinary hosted preflight remains unchanged. Direction verification is additive and runs only through a separate command:

`npm run hosted:preflight:direction --workspace @life-os/api`

It uses the same operator-only environment inputs:

- `LIFE_OS_PREFLIGHT_BASE_URL`
- `LIFE_OS_PREFLIGHT_ACCESS_TOKEN`

The access token remains a short-lived normal Supabase **user** session, never a service-role or admin credential.

## Sequence

The Direction preflight first runs the complete baseline hosted preflight.

If baseline status is not `READY`, Direction is not requested at all.

If baseline is `READY`, the harness issues exactly one additional request:

`GET /api/v1/direction`

with the synthetic user's Bearer session.

No POST/PUT/PATCH/DELETE branch exists in the Direction preflight.

## Exact safe read shape

A successful Direction check requires HTTP 200 and exactly the reviewed public overview shape.

Top level:

- `current`
- `history`

`current` may be `null`. If present, it must contain exactly:

- `id`
- `statement`
- `status = ACTIVE`
- `authorityClass = DECISION`
- `decidedAt`

Every history item must contain exactly:

- `id`
- `statement`
- `status = SUPERSEDED | REVOKED`
- `authorityClass = DECISION`
- `decidedAt`
- `endedAt`

Extra fields fail the preflight. This makes the deployment check a privacy regression guard: fields such as user IDs, request IDs, fingerprints, transport metadata or raw domain events cannot be added silently to the browser Direction contract.

## Safe receipt

The command prints only:

- READY / FAILED
- baseline preflight status
- total requests issued
- `privateWriteAttempts`
- a sanitized Direction check result

It never prints:

- base URL
- access token
- Direction text
- Direction IDs
- user ID
- row data
- provider/database error detail

## Zero-write guarantee

The Direction layer adds one GET request only.

The baseline preflight already audits its request methods. Direction carries forward the baseline `privateWriteAttempts` count unchanged.

A READY Direction preflight therefore requires:

`privateWriteAttempts = 0`

## Activation use

After migration `0007`, Direction capability grants and `LIFE_OS_DIRECTION_ENABLED=true` are deployed:

1. run ordinary `hosted:preflight`;
2. run `hosted:preflight:direction`;
3. require READY + zero writes;
4. only then turn on `NEXT_PUBLIC_LIFE_OS_DIRECTION_ENABLED=true` for the web deployment;
5. verify the `/you` mobile UI with a real browser session.

This keeps deployment verification separate from the user's first real high-authority Direction decision.
