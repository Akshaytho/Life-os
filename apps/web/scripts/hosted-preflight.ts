export type WebHostedPreflightCheckName =
  | "WEB_LIVENESS"
  | "WEB_READINESS"
  | "WEB_PRIVACY_HEADERS"
  | "WEB_ROBOTS_NO_INDEX";

export interface WebHostedPreflightCheckResult {
  name: WebHostedPreflightCheckName;
  outcome: "PASSED" | "FAILED";
  detail: string;
}

export interface WebHostedPreflightReport {
  status: "READY" | "FAILED";
  checks: WebHostedPreflightCheckResult[];
  requestsIssued: number;
  writeAttempts: number;
}

export interface WebHostedPreflightConfiguration {
  baseUrl: string;
  expectedDirection: "dormant" | "enabled";
}

export interface WebHostedPreflightOptions {
  fetchImpl?: typeof fetch;
}

export class WebHostedPreflightConfigurationError extends Error {
  constructor(
    readonly code:
      | "BASE_URL_REQUIRED"
      | "BASE_URL_INVALID"
      | "DIRECTION_EXPECTATION_INVALID"
      | "CLI_ARGUMENTS_INVALID",
  ) {
    super(code);
    this.name = "WebHostedPreflightConfigurationError";
  }
}

function normalized(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result || undefined;
}

function exactHttpsOrigin(value: string | undefined): string {
  const raw = normalized(value);
  if (!raw) throw new WebHostedPreflightConfigurationError("BASE_URL_REQUIRED");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebHostedPreflightConfigurationError("BASE_URL_INVALID");
  }

  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new WebHostedPreflightConfigurationError("BASE_URL_INVALID");
  }

  return url.origin;
}

function expectedDirection(value: string | undefined): "dormant" | "enabled" {
  const normalizedValue = normalized(value)?.toLowerCase();
  if (normalizedValue === undefined || normalizedValue === "dormant") return "dormant";
  if (normalizedValue === "enabled") return "enabled";
  throw new WebHostedPreflightConfigurationError("DIRECTION_EXPECTATION_INVALID");
}

export function webHostedPreflightConfigurationFromEnv(
  env: Record<string, string | undefined>,
): WebHostedPreflightConfiguration {
  return {
    baseUrl: exactHttpsOrigin(env.LIFE_OS_WEB_PREFLIGHT_BASE_URL),
    expectedDirection: expectedDirection(env.LIFE_OS_WEB_PREFLIGHT_EXPECT_DIRECTION),
  };
}

function privacyHeadersReady(headers: Headers): boolean {
  const robots = (headers.get("x-robots-tag") ?? "").toLowerCase();
  const directives = new Set(robots.split(",").map((part) => part.trim()).filter(Boolean));
  return (
    directives.has("noindex")
    && directives.has("nofollow")
    && directives.has("noarchive")
    && directives.has("nosnippet")
    && headers.get("referrer-policy")?.toLowerCase() === "no-referrer"
    && headers.get("x-content-type-options")?.toLowerCase() === "nosniff"
  );
}

function robotsDisallowAll(body: string): boolean {
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean);
  return lines.includes("user-agent: *") && lines.includes("disallow: /");
}

/**
 * Read-only verification for the externally hosted Life OS web origin.
 * It never authenticates, never follows redirects and never issues a method
 * capable of mutating canonical Life OS state.
 */
export async function runWebHostedPreflight(
  configuration: WebHostedPreflightConfiguration,
  options: WebHostedPreflightOptions = {},
): Promise<WebHostedPreflightReport> {
  const baseUrl = exactHttpsOrigin(configuration.baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const requests: Array<{ method: "GET"; path: string }> = [];
  const checks: WebHostedPreflightCheckResult[] = [];

  function record(name: WebHostedPreflightCheckName, passed: boolean, detail: string) {
    checks.push({ name, outcome: passed ? "PASSED" : "FAILED", detail });
  }

  async function get(path: string): Promise<Response> {
    requests.push({ method: "GET", path });
    return fetchImpl(new URL(path, baseUrl), {
      method: "GET",
      redirect: "error",
      headers: { Accept: path === "/robots.txt" ? "text/plain" : "application/json,text/html" },
    });
  }

  try {
    const response = await get("/health/live");
    let body: unknown;
    try { body = await response.json(); } catch { body = undefined; }
    const passed = response.status === 200
      && typeof body === "object"
      && body !== null
      && (body as { status?: unknown }).status === "ok";
    record(
      "WEB_LIVENESS",
      passed,
      passed ? "web process returned the reviewed liveness receipt" : `expected 200 ok, received ${response.status}`,
    );
  } catch {
    record("WEB_LIVENESS", false, "request failed before a response was observed");
  }

  try {
    const response = await get("/health/ready");
    let body: unknown;
    try { body = await response.json(); } catch { body = undefined; }
    const ready = typeof body === "object" && body !== null ? body as Record<string, unknown> : undefined;
    const passed = response.status === 200
      && ready?.status === "ready"
      && ready.mode === "live"
      && ready.direction === configuration.expectedDirection;
    record(
      "WEB_READINESS",
      passed,
      passed
        ? `live web readiness matched expected Direction state ${configuration.expectedDirection}`
        : `expected live/${configuration.expectedDirection} readiness, received ${response.status}`,
    );
  } catch {
    record("WEB_READINESS", false, "request failed before a response was observed");
  }

  try {
    const response = await get("/capture");
    const passed = response.status === 200 && privacyHeadersReady(response.headers);
    record(
      "WEB_PRIVACY_HEADERS",
      passed,
      passed
        ? "hosted web shell returned the reviewed no-index/referrer/content-type headers"
        : `expected 200 with reviewed privacy headers, received ${response.status}`,
    );
  } catch {
    record("WEB_PRIVACY_HEADERS", false, "request failed before a response was observed");
  }

  try {
    const response = await get("/robots.txt");
    let body = "";
    try { body = await response.text(); } catch { body = ""; }
    const passed = response.status === 200 && robotsDisallowAll(body);
    record(
      "WEB_ROBOTS_NO_INDEX",
      passed,
      passed ? "robots policy disallows indexing the hosted development shell" : `expected disallow-all robots policy, received ${response.status}`,
    );
  } catch {
    record("WEB_ROBOTS_NO_INDEX", false, "request failed before a response was observed");
  }

  const writeAttempts = requests.filter((request) => request.method !== "GET").length;
  const allPassed = checks.every((check) => check.outcome === "PASSED");
  return {
    status: allPassed && writeAttempts === 0 ? "READY" : "FAILED",
    checks,
    requestsIssued: requests.length,
    writeAttempts,
  };
}
