/**
 * Hosted development preflight V1.
 *
 * Verifies a real hosted Life OS development deployment (Railway API + Supabase
 * PostgreSQL/Auth) without introducing a new authority model and without writing
 * any private Life OS data.
 *
 * Design constraints:
 *
 * - read-only by construction: the harness may only ever issue GET/HEAD, and it
 *   records every request it makes so "zero private writes" is auditable rather
 *   than merely asserted;
 * - it proves the reviewed auth boundary is live by requiring rejection of the
 *   unauthenticated and invalid-credential cases, not only acceptance of a good
 *   token;
 * - a valid synthetic session must reach an RLS-scoped read that legitimately
 *   finds nothing, which exercises verifier -> request context -> repository
 *   without creating canonical life state;
 * - it never returns or logs credentials, tokens, connection strings or row data.
 */

const PROBE_ID_PREFIX = "lifeos-preflight-absent-";

export type PreflightCheckName =
  | "HEALTH_LIVE"
  | "HEALTH_READY"
  | "PRIVATE_REQUIRES_AUTHENTICATION"
  | "PRIVATE_REJECTS_INVALID_CREDENTIAL"
  | "PRIVATE_REVIEW_READ_SCOPED"
  | "PRIVATE_TRACE_READ_SCOPED"
  | "PRIVATE_UNKNOWN_ROUTE_NOT_FOUND";

export type PreflightOutcome = "PASSED" | "FAILED";

export interface PreflightCheckResult {
  name: PreflightCheckName;
  outcome: PreflightOutcome;
  /** Sanitized reason. Never contains credentials, identifiers or row data. */
  detail: string;
}

export interface PreflightRequestRecord {
  method: string;
  path: string;
  authenticated: boolean;
}

export interface PreflightReport {
  status: "READY" | "FAILED";
  checks: PreflightCheckResult[];
  requestsIssued: number;
  privateWriteAttempts: number;
}

export interface HostedPreflightConfiguration {
  baseUrl: string;
  accessToken: string;
}

export interface HostedPreflightOptions {
  fetchImpl?: typeof fetch;
  /** Overridable only so tests stay deterministic. */
  probeId?: string;
}

export class HostedPreflightConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostedPreflightConfigurationError";
  }
}

function normalizedValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function requiredValue(value: string | undefined, name: string): string {
  const normalized = normalizedValue(value);
  if (!normalized) throw new HostedPreflightConfigurationError(`${name} is required`);
  return normalized;
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HostedPreflightConfigurationError(
      "LIFE_OS_PREFLIGHT_BASE_URL must be a valid http(s) origin",
    );
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new HostedPreflightConfigurationError(
      "LIFE_OS_PREFLIGHT_BASE_URL must be a valid http(s) origin",
    );
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new HostedPreflightConfigurationError(
      "LIFE_OS_PREFLIGHT_BASE_URL must be an origin without credentials, path, query parameters or fragments",
    );
  }

  return url.origin;
}

export function hostedPreflightConfigurationFromEnv(
  env: NodeJS.ProcessEnv,
): HostedPreflightConfiguration {
  return {
    baseUrl: normalizeBaseUrl(requiredValue(env.LIFE_OS_PREFLIGHT_BASE_URL, "LIFE_OS_PREFLIGHT_BASE_URL")),
    accessToken: requiredValue(env.LIFE_OS_PREFLIGHT_ACCESS_TOKEN, "LIFE_OS_PREFLIGHT_ACCESS_TOKEN"),
  };
}

/**
 * A capture identifier that satisfies the private read route's opaque-id shape
 * but cannot correspond to real Life OS state. Reading it must return 404.
 */
export function preflightProbeId(random: () => string = () => Math.random().toString(36).slice(2)): string {
  return `${PROBE_ID_PREFIX}${random()}`;
}

interface ProbeResponse {
  status: number;
  body: { status?: unknown } | undefined;
}

export async function runHostedPreflight(
  configuration: HostedPreflightConfiguration,
  options: HostedPreflightOptions = {},
): Promise<PreflightReport> {
  const baseUrl = normalizeBaseUrl(requiredValue(configuration.baseUrl, "LIFE_OS_PREFLIGHT_BASE_URL"));
  const accessToken = requiredValue(configuration.accessToken, "LIFE_OS_PREFLIGHT_ACCESS_TOKEN");
  const fetchImpl = options.fetchImpl ?? fetch;
  const probeId = options.probeId ?? preflightProbeId();

  const issued: PreflightRequestRecord[] = [];
  const checks: PreflightCheckResult[] = [];

  async function probe(
    path: string,
    credential: "none" | "invalid" | "session",
  ): Promise<ProbeResponse> {
    // Read-only by construction. This helper has no branch that can issue a
    // method capable of mutating private Life OS state.
    const headers: Record<string, string> = { Accept: "application/json" };
    if (credential === "invalid") headers.Authorization = "Bearer not-a-valid-life-os-session";
    if (credential === "session") headers.Authorization = `Bearer ${accessToken}`;

    issued.push({ method: "GET", path, authenticated: credential !== "none" });

    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: "GET",
      redirect: "error",
      headers,
    });

    let body: { status?: unknown } | undefined;
    try {
      body = (await response.json()) as { status?: unknown };
    } catch {
      body = undefined;
    }

    return { status: response.status, body };
  }

  function record(
    name: PreflightCheckName,
    passed: boolean,
    detail: string,
  ) {
    checks.push({ name, outcome: passed ? "PASSED" : "FAILED", detail });
  }

  async function expect(
    name: PreflightCheckName,
    path: string,
    credential: "none" | "invalid" | "session",
    expectedStatus: number,
    expectedBodyStatus: string,
  ) {
    try {
      const result = await probe(path, credential);
      const statusMatches = result.status === expectedStatus;
      const bodyMatches = result.body?.status === expectedBodyStatus;
      record(
        name,
        statusMatches && bodyMatches,
        statusMatches && bodyMatches
          ? `expected ${expectedStatus} ${expectedBodyStatus}`
          : `expected ${expectedStatus} ${expectedBodyStatus}, received ${result.status} ${
            typeof result.body?.status === "string" ? result.body.status : "unparsable"
          }`,
      );
    } catch {
      // Provider/network detail is deliberately withheld from the report.
      record(name, false, "request failed before a response was observed");
    }
  }

  await expect("HEALTH_LIVE", "/health/live", "none", 200, "ok");
  await expect("HEALTH_READY", "/health/ready", "none", 200, "ready");

  const reviewPath = `/api/v1/captures/${probeId}/review`;
  const tracePath = `/api/v1/interactions/${probeId}/trace`;

  await expect(
    "PRIVATE_REQUIRES_AUTHENTICATION",
    reviewPath,
    "none",
    401,
    "authentication_required",
  );
  await expect(
    "PRIVATE_REJECTS_INVALID_CREDENTIAL",
    reviewPath,
    "invalid",
    401,
    "authentication_required",
  );
  await expect("PRIVATE_REVIEW_READ_SCOPED", reviewPath, "session", 404, "not_found");
  await expect("PRIVATE_TRACE_READ_SCOPED", tracePath, "session", 404, "not_found");
  await expect(
    "PRIVATE_UNKNOWN_ROUTE_NOT_FOUND",
    "/api/v1/there-is-no-such-life-os-route",
    "session",
    404,
    "not_found",
  );

  const privateWriteAttempts = issued.filter(
    (request) => request.path.startsWith("/api/v1/") && request.method !== "GET" && request.method !== "HEAD",
  ).length;

  const allPassed = checks.every((check) => check.outcome === "PASSED");

  return {
    status: allPassed && privateWriteAttempts === 0 ? "READY" : "FAILED",
    checks,
    requestsIssued: issued.length,
    privateWriteAttempts,
  };
}
