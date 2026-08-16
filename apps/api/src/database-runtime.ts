import { readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { ApiRuntimeConfigurationError, databaseUrlForRuntime } from "./api-runtime";
import { resolveRuntimeProvenance } from "./runtime-provenance";

/**
 * Life OS supports exactly two understandable database transport states. Hosted development
 * must verify the provider chain and hostname; disposable local/CI PostgreSQL may run without
 * TLS. The ambiguous libpq middle modes (`prefer`, `allow`, `require`, `no-verify`, `verify-ca`)
 * are deliberately unsupported because each one silently accepts an unverified peer.
 */
export const supportedDatabaseTlsModes = ["disable", "verify-full"] as const;
export type DatabaseTlsMode = (typeof supportedDatabaseTlsModes)[number];

export type DatabaseRuntimeDiagnosticCode =
  | "DATABASE_URL_SSL_PARAMETERS"
  | "DATABASE_TLS_MODE_INVALID"
  | "DATABASE_TLS_MODE_UNVERIFIED"
  | "DATABASE_TLS_CA_REQUIRED"
  | "DATABASE_TLS_CA_URL_FORBIDDEN"
  | "DATABASE_TLS_CA_UNREADABLE"
  | "DATABASE_TLS_CA_NOT_FILE"
  | "DATABASE_TLS_CA_TOO_LARGE"
  | "DATABASE_TLS_CA_PRIVATE_KEY"
  | "DATABASE_TLS_CA_NOT_PEM";

class DatabaseRuntimeConfigurationError extends ApiRuntimeConfigurationError {
  readonly diagnosticCode: DatabaseRuntimeDiagnosticCode;

  constructor(diagnosticCode: DatabaseRuntimeDiagnosticCode, message: string) {
    super(message);
    this.diagnosticCode = diagnosticCode;
  }
}

/** Connection-string parameters that would let an operator override the reviewed TLS object. */
const forbiddenConnectionStringSslParameters = ["sslmode", "sslrootcert", "sslcert", "sslkey"];

/** A public CA bundle is small. This bound keeps an accidental archive or key store out. */
const maximumCertificateFileBytes = 64 * 1024;

const certificateMarker = "-----BEGIN CERTIFICATE-----";
const privateKeyMarker = "PRIVATE KEY";

export interface DatabaseTlsConfiguration {
  ca: string;
  rejectUnauthorized: true;
}

export interface DatabasePoolConfiguration {
  connectionString: string;
  ssl?: DatabaseTlsConfiguration;
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

/**
 * node-postgres lets connection-string SSL parameters overwrite a programmatic `ssl` object,
 * so a stray `?sslmode=no-verify` would silently disable the verification this module exists
 * to guarantee. Refuse the URL instead, without echoing any part of it.
 */
function assertNoConnectionStringSslParameters(databaseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    // Not WHATWG-parseable. Fall back to a parameter-name scan so an unusual but valid
    // libpq URL still cannot smuggle SSL parameters past this boundary.
    const query = databaseUrl.slice(databaseUrl.indexOf("?") + 1);
    if (databaseUrl.includes("?")) {
      for (const parameter of query.split("&")) {
        const name = parameter.split("=")[0]?.trim().toLowerCase();
        if (name && forbiddenConnectionStringSslParameters.includes(name)) {
          throw new DatabaseRuntimeConfigurationError(
            "DATABASE_URL_SSL_PARAMETERS",
            "DATABASE_URL must not contain SSL parameters; Life OS owns TLS verification through the reviewed runtime TLS configuration",
          );
        }
      }
    }
    return;
  }

  for (const name of parsed.searchParams.keys()) {
    if (forbiddenConnectionStringSslParameters.includes(name.trim().toLowerCase())) {
      throw new DatabaseRuntimeConfigurationError(
        "DATABASE_URL_SSL_PARAMETERS",
        "DATABASE_URL must not contain SSL parameters; Life OS owns TLS verification through the reviewed runtime TLS configuration",
      );
    }
  }
}

function resolveDatabaseTlsMode(env: NodeJS.ProcessEnv): DatabaseTlsMode {
  const value = optionalText(env.LIFE_OS_DATABASE_TLS_MODE)?.toLowerCase();
  if (value === undefined) return "disable";
  if (!supportedDatabaseTlsModes.includes(value as DatabaseTlsMode)) {
    throw new DatabaseRuntimeConfigurationError(
      "DATABASE_TLS_MODE_INVALID",
      `LIFE_OS_DATABASE_TLS_MODE must be one of ${supportedDatabaseTlsModes.join(", ")}`,
    );
  }
  return value as DatabaseTlsMode;
}

/**
 * Trust material is reviewed with the release, never fetched at startup. The path is resolved
 * against the process working directory because the hosted service runs from the repository
 * root, which makes the deployed value a reviewable repository path.
 */
function readReviewedCertificateAuthority(env: NodeJS.ProcessEnv): string {
  const configuredPath = optionalText(env.LIFE_OS_DATABASE_TLS_CA_FILE);
  if (!configuredPath) {
    throw new DatabaseRuntimeConfigurationError(
      "DATABASE_TLS_CA_REQUIRED",
      "LIFE_OS_DATABASE_TLS_CA_FILE is required when LIFE_OS_DATABASE_TLS_MODE is verify-full",
    );
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(configuredPath)) {
    throw new DatabaseRuntimeConfigurationError(
      "DATABASE_TLS_CA_URL_FORBIDDEN",
      "LIFE_OS_DATABASE_TLS_CA_FILE must be a repository file path, not a URL",
    );
  }

  const certificatePath = isAbsolute(configuredPath) ? configuredPath : resolve(process.cwd(), configuredPath);

  let stats;
  try {
    stats = statSync(certificatePath);
  } catch {
    throw new DatabaseRuntimeConfigurationError(
      "DATABASE_TLS_CA_UNREADABLE",
      `LIFE_OS_DATABASE_TLS_CA_FILE could not be read at ${configuredPath}`,
    );
  }
  if (!stats.isFile()) {
    throw new DatabaseRuntimeConfigurationError(
      "DATABASE_TLS_CA_NOT_FILE",
      `LIFE_OS_DATABASE_TLS_CA_FILE must be a regular file at ${configuredPath}`,
    );
  }
  if (stats.size > maximumCertificateFileBytes) {
    throw new DatabaseRuntimeConfigurationError(
      "DATABASE_TLS_CA_TOO_LARGE",
      `LIFE_OS_DATABASE_TLS_CA_FILE must be at most ${maximumCertificateFileBytes} bytes`,
    );
  }

  let certificate: string;
  try {
    certificate = readFileSync(certificatePath, "utf8");
  } catch {
    throw new DatabaseRuntimeConfigurationError(
      "DATABASE_TLS_CA_UNREADABLE",
      `LIFE_OS_DATABASE_TLS_CA_FILE could not be read at ${configuredPath}`,
    );
  }

  // Never echo the file body. A malformed anchor is reported by shape, not by content.
  if (certificate.includes(privateKeyMarker)) {
    throw new DatabaseRuntimeConfigurationError(
      "DATABASE_TLS_CA_PRIVATE_KEY",
      "LIFE_OS_DATABASE_TLS_CA_FILE must contain only public certificate material",
    );
  }
  if (!certificate.includes(certificateMarker)) {
    throw new DatabaseRuntimeConfigurationError(
      "DATABASE_TLS_CA_NOT_PEM",
      "LIFE_OS_DATABASE_TLS_CA_FILE must contain a PEM certificate",
    );
  }

  return certificate;
}

/**
 * Single boundary that turns runtime configuration into pg Pool configuration. Returns
 * undefined only when the environment legitimately runs without a database.
 */
export function databasePoolConfigurationFromEnv(
  env: NodeJS.ProcessEnv,
): DatabasePoolConfiguration | undefined {
  const databaseUrl = databaseUrlForRuntime(env);
  if (!databaseUrl) return undefined;

  assertNoConnectionStringSslParameters(databaseUrl);

  const environment = resolveRuntimeProvenance(env).environment;
  const mode = resolveDatabaseTlsMode(env);

  // Hosted development talks to a managed provider over the public internet. An unverified
  // transport there is not a degraded mode, it is a different security posture, so the
  // permissive mode is refused outright rather than warned about.
  if (environment === "development" && mode !== "verify-full") {
    throw new DatabaseRuntimeConfigurationError(
      "DATABASE_TLS_MODE_UNVERIFIED",
      "LIFE_OS_DATABASE_TLS_MODE must be verify-full when DATABASE_URL is used in development",
    );
  }

  if (mode === "disable") return { connectionString: databaseUrl };

  return {
    connectionString: databaseUrl,
    ssl: { ca: readReviewedCertificateAuthority(env), rejectUnauthorized: true },
  };
}
