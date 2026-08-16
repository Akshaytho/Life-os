import {
  runHostedPreflight,
  type HostedPreflightConfiguration,
  type HostedPreflightOptions,
  type PreflightOutcome,
  type PreflightReport,
} from "./hosted-preflight";

export interface DirectionHostedPreflightCheck {
  name: "DIRECTION_READ_SCOPED";
  outcome: PreflightOutcome;
  detail: string;
}

export interface DirectionHostedPreflightReport {
  status: "READY" | "FAILED";
  baseline: PreflightReport;
  direction: DirectionHostedPreflightCheck;
  requestsIssued: number;
  privateWriteAttempts: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function validCurrentDirection(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value) || !exactKeys(value, ["id", "statement", "status", "authorityClass", "decidedAt"])) return false;
  return (
    typeof value.id === "string"
    && typeof value.statement === "string"
    && value.status === "ACTIVE"
    && value.authorityClass === "DECISION"
    && typeof value.decidedAt === "string"
  );
}

function validHistoryDirection(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, ["id", "statement", "status", "authorityClass", "decidedAt", "endedAt"])) {
    return false;
  }
  return (
    typeof value.id === "string"
    && typeof value.statement === "string"
    && (value.status === "SUPERSEDED" || value.status === "REVOKED")
    && value.authorityClass === "DECISION"
    && typeof value.decidedAt === "string"
    && typeof value.endedAt === "string"
  );
}

function validDirectionOverview(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, ["current", "history"])) return false;
  if (!validCurrentDirection(value.current)) return false;
  if (!Array.isArray(value.history)) return false;
  return value.history.every(validHistoryDirection);
}

/**
 * Adds one authenticated GET-only Direction proof after the ordinary hosted preflight.
 * No synthetic Direction is created: the check accepts either an empty canonical
 * overview or the existing synthetic user's current/history shape, while never
 * returning the row content in its report.
 */
export async function runDirectionHostedPreflight(
  configuration: HostedPreflightConfiguration,
  options: HostedPreflightOptions = {},
): Promise<DirectionHostedPreflightReport> {
  const baseline = await runHostedPreflight(configuration, options);
  if (baseline.status !== "READY") {
    return {
      status: "FAILED",
      baseline,
      direction: {
        name: "DIRECTION_READ_SCOPED",
        outcome: "FAILED",
        detail: "baseline hosted preflight was not ready; Direction read was not attempted",
      },
      requestsIssued: baseline.requestsIssued,
      privateWriteAttempts: baseline.privateWriteAttempts,
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  let direction: DirectionHostedPreflightCheck;
  try {
    const response = await fetchImpl(new URL("/api/v1/direction", configuration.baseUrl), {
      method: "GET",
      redirect: "error",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${configuration.accessToken}`,
      },
    });

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }

    const passed = response.status === 200 && validDirectionOverview(body);
    direction = {
      name: "DIRECTION_READ_SCOPED",
      outcome: passed ? "PASSED" : "FAILED",
      detail: passed
        ? "authenticated Direction read returned the exact reviewed canonical overview shape"
        : `expected 200 canonical Direction overview, received ${response.status} ${body === undefined ? "unparsable" : "unexpected_shape"}`,
    };
  } catch {
    direction = {
      name: "DIRECTION_READ_SCOPED",
      outcome: "FAILED",
      detail: "Direction request failed before a response was observed",
    };
  }

  const privateWriteAttempts = baseline.privateWriteAttempts;
  return {
    status: direction.outcome === "PASSED" && privateWriteAttempts === 0 ? "READY" : "FAILED",
    baseline,
    direction,
    requestsIssued: baseline.requestsIssued + 1,
    privateWriteAttempts,
  };
}
