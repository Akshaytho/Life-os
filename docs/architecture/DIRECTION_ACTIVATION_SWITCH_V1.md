# Direction Activation Switch V1

**Canonical artifact reviewed:** `LIFE-OS-CANON-001` v1.2.0  
**Depends on:** Direction decision contract, read model, private transport and browser UI V1  
**Default hosted state:** OFF

## Purpose

Turn the previously reviewed Direction pieces into one explicit, fail-closed capability switch without changing the existing private runtime when the switch is absent or false.

Direction remains a high-authority user `DECISION`. This slice does not change AI authority or ordinary proposal Apply authority.

## Server feature gate

The API recognizes:

`LIFE_OS_DIRECTION_ENABLED=false|true`

Default/false means:

- Direction PostgreSQL adapters are not composed;
- `/api/v1/direction` and `/api/v1/direction/current` are indistinguishable from unknown routes (`404`);
- the ordinary seven-table private readiness contract is unchanged;
- no Direction database privilege is required for the running application role.

`true` is accepted only when the reviewed private API is also explicitly enabled. Production remains blocked by the existing private-runtime V1 policy.

## Separate least-privilege capability

Direction is deliberately **not** added to the ordinary private-table CRUD list.

The ordinary application contract still requires exact `SELECT, INSERT, UPDATE, DELETE` on the seven established private tables.

Direction has a narrower capability:

Required:

- `SELECT`
- `INSERT`
- `UPDATE`

Forbidden:

- `DELETE`
- `TRUNCATE`
- `REFERENCES`
- `TRIGGER`

The running app does not need to delete a Direction decision. History is superseded/revoked, not erased.

## Operator role tooling

Separate explicit commands manage only the Direction capability:

Plan:

`npm run direction-role --workspace @life-os/api`

Apply:

`npm run direction-role:apply --workspace @life-os/api`

Revoke:

`npm run direction-role:revoke --workspace @life-os/api`

These commands use the existing migration/admin connection and `LIFE_OS_APPLICATION_DB_ROLE`. They do not require or rotate the application-role password.

Apply refuses to proceed unless:

- all repository migrations are applied;
- the baseline application role already passes its established exact least-privilege plan;
- `direction_decision` exists;
- FORCE RLS is enabled;
- the application role is not the table owner.

Apply first revokes existing Direction table grants and then grants only `SELECT, INSERT, UPDATE`.

Revoke removes all Direction table grants while leaving the seven-table baseline role untouched.

## Additional startup readiness

When the Direction server flag is true, startup combines:

1. ordinary private database readiness; and
2. Direction capability readiness.

Direction readiness proves:

- `direction_decision` exists;
- RLS + FORCE RLS are enabled;
- current application role is not owner;
- required Direction privileges exist;
- forbidden Direction privileges are absent;
- an unscoped application connection sees zero Direction rows.

If either readiness boundary fails, the private API refuses to listen.

When the Direction flag is false, this additional query is not part of startup/readiness, preserving the existing hosted behavior.

## Runtime composition

With Direction disabled, runtime dependencies contain no Direction reader or Direction write unit of work.

With Direction enabled, the existing least-privileged application Pool composes:

- `PostgresDirectionDecisionReader`;
- `PostgresDirectionDecisionUnitOfWork`;
- server-owned Direction clock;
- server-owned Direction/event IDs;
- existing isolated private Direction handler.

The main private router exposes Direction paths only while the capability is enabled.

## Browser gate remains separate

The web already uses:

`NEXT_PUBLIC_LIFE_OS_DIRECTION_ENABLED=false`

Server activation must happen and be verified **before** the public browser flag is switched to true.

This two-gate sequence prevents a deployed phone UI from advertising a high-authority feature before the backend has proven its database boundary.

## Real PostgreSQL proof

Integration coverage applies all migrations through `0007`, provisions the existing baseline app role, and proves:

1. baseline private readiness is green while Direction remains unprivileged;
2. Direction readiness is red before the separate capability grant;
3. Direction plan sees the protected table but missing privileges;
4. Direction apply grants exactly `SELECT, INSERT, UPDATE`;
5. DELETE and DDL-like privileges remain denied;
6. combined readiness becomes green;
7. enabled private runtime can read an empty Direction, activate a user-authored Direction and safely replay the same idempotent request;
8. a different authenticated user cannot see that Direction;
9. exactly one Direction row and one activation domain event are written for the replayed request;
10. Direction revoke makes Direction readiness red again while baseline private readiness stays green.

## Hosted development activation sequence

After this PR is reviewed and merged, the external development activation becomes intentionally short:

1. run migration plan and apply migration `0007` with the admin migration connection;
2. verify the existing baseline `db-role` plan is ready;
3. run `direction-role` plan, then `direction-role:apply`;
4. set Railway `LIFE_OS_DIRECTION_ENABLED=true` and deploy;
5. verify `/health/ready` and authenticated Direction GET/POST/replay/cross-user boundaries;
6. only then enable the web deployment's `NEXT_PUBLIC_LIFE_OS_DIRECTION_ENABLED=true`;
7. verify `/you` on a real phone session.

Rollback is symmetric:

1. turn the public browser flag off;
2. turn the Railway server flag off and verify baseline readiness;
3. run `direction-role:revoke` if the capability should be removed from the application credential.

No schema deletion or history destruction is required for rollback.
