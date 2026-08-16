# Life OS — Hosted Development Application Role V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Depends on:** `HOSTED_DEVELOPMENT_MIGRATIONS_V1.md`, `PRIVATE_RUNTIME_COMPOSITION_V1.md`  
**Classification:** ALIGNED + IMPLEMENTATION  
**Status:** repository provisioning tooling implemented; no hosted database role or credential has been created by this artifact

## Goal

Provision one dedicated PostgreSQL login for the Life OS API after schema migrations are complete, then make the running API independently prove that the same credential still satisfies the reviewed least-privilege contract.

Supabase supports custom Postgres login roles for external services and recommends using a separate database user per service rather than sharing the primary `postgres` credential. Life OS follows that model.

This role is an ordinary PostgreSQL application login. It is **not** the Supabase Auth `authenticated` role, the Supabase `service_role`, the migration/admin role, or the database owner.

## Commands

Plan only:

```bash
npm run db-role --workspace @life-os/api
```

This uses `MIGRATION_DATABASE_URL` to inspect:

- migration status;
- whether the named application role exists;
- role attributes and memberships;
- schema privileges;
- private-table ownership/RLS state;
- application table grants;
- user-scope function execution;
- migration-ledger access.

It does not create/alter a role and does not require the application-role password.

Apply deliberately:

```bash
npm run db-role:apply --workspace @life-os/api
```

Apply requires:

- `MIGRATION_DATABASE_URL`;
- `LIFE_OS_APPLICATION_DB_ROLE`, default `lifeos_app`;
- `LIFE_OS_APPLICATION_DB_PASSWORD`.

The password must be at least 24 characters, contain no control characters, and must not contain the role name.

The CLI never prints the password or either database connection URL.

## Environment boundary

The role commands reuse Hosted Development Migration V1's environment boundary:

- local / CI / development allowed;
- production refused with no override;
- `MIGRATION_DATABASE_URL` required;
- in hosted development, the obvious unsafe case where `MIGRATION_DATABASE_URL` and `DATABASE_URL` are identical is rejected.

Role apply also refuses to run while repository migrations are pending.

## Reserved role names

The default is:

```text
lifeos_app
```

V1 accepts only a narrow lowercase identifier shape and rejects reuse of managed/elevated names such as:

- `postgres`;
- `anon`;
- `authenticated`;
- `authenticator`;
- `service_role`;
- `pg_*`;
- `supabase_*`.

This prevents the deployment helper from turning an existing platform role into the Life OS application credential by accident.

## Exact application role contract

The desired role attributes are:

```text
LOGIN
NOSUPERUSER
NOCREATEDB
NOCREATEROLE
NOINHERIT
NOREPLICATION
NOBYPASSRLS
```

V1 also requires **zero role memberships**.

An existing role with memberships is not silently repaired. Apply fails with `ROLE_STATE_UNSAFE` so inherited/group authority can be reviewed manually.

### New role versus existing role

Apply establishes those attributes when it creates the role, and verifies rather than rewrites them when the role already exists.

**Role does not exist.** Apply issues `CREATE ROLE` with the full reviewed attribute set above, then grants the reviewed object privileges.

**Role exists and attributes are safe.** Apply confirms, before any mutation, that every attribute above already holds and that the role has zero memberships. Only then does it rotate the credential with a password-only statement:

```text
ALTER ROLE <role> PASSWORD <new password>
```

It deliberately does not restate `LOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, `NOREPLICATION`, or `NOBYPASSRLS`, because those attributes were just inspected and are re-inspected afterwards. Object-privilege repair is unchanged and still runs after rotation, and final inspection must still report `ready`.

**Role exists and any attribute is unsafe.** Apply fails closed with `ROLE_STATE_UNSAFE` **before** it rotates the password or issues any `GRANT`/`REVOKE`. The unsafe attribute is left exactly as found so the elevated authority can be reviewed deliberately. The tool never repairs a privileged attribute automatically — a role that has gained `SUPERUSER`, `BYPASSRLS`, `CREATEROLE`, or inheritance is treated as a security event, not as drift to silently normalise.

### Why existing roles are verified rather than rewritten

On a managed PostgreSQL service the administrative role supplied to customers is frequently not a true superuser. Such a role can create a custom login role and can rotate that role's password, but PostgreSQL rejects an `ALTER ROLE` that names superuser-sensitive attributes — including the negative forms — unless the caller is a superuser. Restating the already-correct attributes therefore fails with `permission denied to alter role` even though nothing about the role needs to change.

Restating them buys nothing in either case: on a superuser build the attributes are already correct, and on a managed build the statement cannot execute at all. Inspecting before mutating and re-inspecting after is strictly stronger, because it also refuses roles that were tampered with out of band.

This rule is not specific to any one provider. It is the general contract for managed PostgreSQL, where role attributes are platform-governed and credentials are the part the application is expected to rotate.

## Schema authority

The role receives:

- `USAGE` on the active Life OS schema.

The role must not have:

- `CREATE` on that schema.

Provisioning first revokes direct schema privileges from the role and then grants only `USAGE`.

If authority still arrives through another source such as a public/inherited grant, final inspection and runtime readiness remain false instead of pretending the direct revoke was sufficient.

## Private table authority

The seven ordinary private runtime tables are:

- `capture_record`;
- `routing_interpretation`;
- `routing_proposal`;
- `calendar_event`;
- `domain_event`;
- `applied_proposal`;
- `proposal_rejection`.

For each table the role receives exactly:

- `SELECT`;
- `INSERT`;
- `UPDATE`;
- `DELETE`.

It must not have:

- `TRUNCATE`;
- `REFERENCES`;
- `TRIGGER`.

The runtime also requires every table to have enabled + forced RLS and to be owned by a different role.

Table-level CRUD does not bypass user ownership because every private transaction still binds the authenticated user into transaction-local `lifeos.user_id` and PostgreSQL RLS remains authoritative.

## User-scope function

The application role receives `EXECUTE` on:

```text
lifeos_current_user_id()
```

This function is needed by RLS/readiness to observe the transaction-local Life OS user scope. The role does not receive function-definition ownership or schema-creation authority.

## Migration history boundary

The role is explicitly revoked from `lifeos_schema_migration`.

Runtime readiness verifies it has none of the ordinary table privileges on the migration ledger.

Therefore the private application credential cannot mark migrations applied, rewrite checksums, or use migration history as an application data channel.

Schema administration remains the job of `MIGRATION_DATABASE_URL` and the plan-first migration tooling.

## Provisioning transaction and lock

Apply mode:

1. verifies no migrations are pending;
2. acquires one PostgreSQL advisory lock for application-role provisioning;
3. inspects any existing role;
4. refuses existing role memberships;
5. creates or rotates the dedicated login with the safe role attributes;
6. resets direct schema/table grants to the reviewed allow-list;
7. revokes migration-ledger access;
8. grants the user-scope function execution;
9. re-inspects the role inside the same transaction;
10. commits only if the exact Life OS role contract is satisfied.

A failed final inspection rolls the provisioning transaction back.

The password is quoted by PostgreSQL itself before being used in the role DDL rather than interpolated through a hand-written JavaScript escaping rule.

## Runtime readiness agreement

`createPrivateDatabaseReadinessProbe(...)` independently verifies the connected `DATABASE_URL` role, not the admin-side provisioning receipt.

It requires:

- no superuser / bypass-RLS / create-role / create-database / replication authority;
- `NOINHERIT`;
- zero role memberships;
- schema `USAGE` but no `CREATE`;
- all seven private tables present;
- all seven protected by enabled + forced RLS;
- application role owns none of those tables;
- exact CRUD grants on all seven without `TRUNCATE/REFERENCES/TRIGGER`;
- no user scope before a request;
- zero visible Capture rows without a user scope;
- no migration-ledger access.

The provisioner and runtime therefore agree on the same least-privilege definition from two separate code paths.

## Drift behavior

Direct privilege drift is detectable and repairable.

The PostgreSQL integration proves that granting any of these makes runtime readiness false:

- `CREATE` on the Life OS schema;
- `SELECT` on the migration ledger;
- `TRUNCATE` on `capture_record`.

Re-running `db-role:apply` removes those direct grants and restores readiness.

Role memberships are intentionally different: they cause readiness failure **and** provisioning refusal, preserving the unsafe state for deliberate manual review instead of guessing which inherited authority is safe to remove.

## Supabase connection choice

Supabase currently documents:

- direct Postgres connections as suitable for persistent servers when IPv6/direct reachability is available and as the preferred path for migrations;
- Supavisor session mode as the persistent-client alternative when IPv4 is required.

The role provisioner does not construct a Supabase connection string because pooler usernames/hosts are project-specific deployment data.

For a real hosted development setup:

```text
MIGRATION_DATABASE_URL
  → use the Supabase dashboard's migration/admin direct connection

DATABASE_URL
  → use the dashboard-generated connection for the new Life OS application role
     via direct Postgres or Supavisor session mode as required by Railway networking
```

When Supavisor requires a project-qualified username, use the exact username/host shown by Supabase's **Connect** panel rather than inventing it in source code.

## Secret boundary

`LIFE_OS_APPLICATION_DB_PASSWORD` is an admin-tool input only.

After role provisioning, the operator/platform uses that password to create the server-only `DATABASE_URL` in Railway or the chosen secret store.

Never:

- commit the password to Git;
- put the password into `.env.example` beyond an empty placeholder;
- expose it to browser JavaScript;
- copy it into technical telemetry;
- use it as `MIGRATION_DATABASE_URL`;
- use a Supabase service-role key as a substitute for this Postgres credential.

The plan/apply receipts contain role/schema/safety metadata only; they do not contain the password.

## PostgreSQL integration proof

`application-db-role.integration.ts` uses a disposable schema and synthetic global Postgres role to prove:

1. role apply refuses while migrations are pending;
2. migrations `0001`–`0006` are applied first through the reviewed migration runner;
3. the new role is created with the exact safe attributes/grants;
4. the returned receipt contains no password;
5. a real Pool authenticated as the new role passes private runtime readiness;
6. unscoped Capture reads return zero rows;
7. the role cannot `CREATE TABLE` in the Life OS schema;
8. the role cannot read or update the migration ledger;
9. the role lacks `TRUNCATE/REFERENCES/TRIGGER` on private tables;
10. a second apply is idempotent/safe and rotates the supplied password;
11. direct schema/ledger/TRUNCATE privilege drift makes readiness fail and re-provisioning repairs it;
12. role membership makes readiness fail and causes apply to stop for manual review.

## Deliberate non-goals

V1 does not:

- create a Supabase project;
- create a Railway service;
- generate/store a real secret;
- construct a hosted `DATABASE_URL` from guessed platform details;
- grant service-role/admin authority to the application;
- remove role memberships automatically;
- provision production;
- introduce personal Life OS data.

The remaining next step after repository validation is external hosted-development setup with synthetic data first.
