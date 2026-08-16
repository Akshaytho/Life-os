# Life OS — Hosted PostgreSQL TLS V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Depends on:** `HOSTED_DEVELOPMENT_APPLICATION_ROLE_V1.md`, `PRIVATE_RUNTIME_COMPOSITION_V1.md`  
**Classification:** ALIGNED + IMPLEMENTATION  
**Status:** implemented; hosted development connects through the reviewed trust anchor committed with the release

## Goal

Make the hosted API's database transport verifiably private: encrypted, authenticated against a known certificate authority, and bound to the expected hostname. Life OS treats an unverified database transport as a different security posture rather than a degraded one, so there is no permissive fallback.

## The contract

Hosted development requires all three properties, equivalent to libpq `verify-full`:

- TLS encryption;
- certificate authority verification;
- hostname verification.

Two states are supported, and no ambiguous middle mode:

| `LIFE_OS_DATABASE_TLS_MODE` | Where | Behavior |
| --- | --- | --- |
| `disable` | local / CI disposable PostgreSQL | No TLS. Refused whenever `DATABASE_URL` is used with `LIFE_OS_ENVIRONMENT=development`. |
| `verify-full` | hosted development | TLS with CA and hostname verification against the reviewed anchor. |

`prefer`, `allow`, `require`, `no-verify` and `verify-ca` are **not** supported. Each of them accepts an unverified peer in at least one reachable configuration, which is precisely the outcome this artifact exists to prevent.

`require` deserves specific mention: libpq treats it as encrypt-without-verification, and node-postgres 8.23 treats it as full verification. A mode whose meaning depends on which client library reads it cannot be part of a reviewed security contract.

## Division of responsibility

**`DATABASE_URL` carries connection identity only** — protocol, user, password, host, port, database.

It must not carry `sslmode`, `sslrootcert`, `sslcert` or `sslkey`. node-postgres lets connection-string SSL parameters overwrite a programmatic `ssl` object, so a stray parameter in a platform variable could silently disable verification. Configuration therefore refuses those parameters before any pool is created, and reports the refusal without echoing the URL, host, user, password or certificate contents.

**Application code owns the TLS contract.** `apps/api/src/database-runtime.ts` is the single boundary that turns runtime configuration into pg pool configuration. `main.ts` constructs a pool from that result and knows nothing about any provider's certificate.

For `verify-full` the resulting configuration is:

```text
{
  connectionString: <identity only>,
  ssl: { ca: <reviewed PEM>, rejectUnauthorized: true }
}
```

Node's standard TLS hostname verification applies. There is no custom `checkServerIdentity`, and `rejectUnauthorized` is never false.

## Trust anchor

The hosted development anchor is committed at:

```text
apps/api/certs/supabase-root-2021.crt
```

A public certificate authority certificate is **not a secret**. Committing it is deliberate:

- Railway builds are reproducible;
- a CA change becomes a reviewed code change with history;
- security-critical trust configuration is not hidden inside an opaque platform variable;
- no secret enters Git.

The anchor is validated before use. The configured value must be a repository path rather than a URL, and the file must exist, be a regular file, stay within a conservative 64 KiB bound, contain PEM `CERTIFICATE` markers, and contain no private-key marker. The API never downloads trust material at startup; a deployed release verifies against exactly the certificate reviewed with it.

Obtain the certificate only from the authenticated Supabase dashboard for the project — Database Settings → SSL Configuration — never from a search result, gist, paste or intercepted connection.

## Certificate rotation

If the provider changes the database CA:

1. download the new CA from authenticated Supabase Database Settings;
2. verify its metadata (`subject`, `issuer`, validity dates, SHA-256 fingerprint) and confirm it carries no private key;
3. update the certificate file in a focused PR;
4. run all repository gates;
5. test against the hosted database;
6. deploy;
7. only then retire the previous trust anchor.

Never replace CA material directly in Railway. An anchor that was not reviewed with the release is indistinguishable, at runtime, from an attacker-supplied one.

## Forbidden

- `sslmode=no-verify`;
- `rejectUnauthorized: false`;
- URL-based `sslmode` / `sslrootcert` / `sslcert` / `sslkey` overrides;
- runtime CA downloads;
- weakening or bypassing hostname verification;
- relaxing any readiness check because TLS fails.

A TLS failure is a refusal to start, not a reason to lower the bar.
