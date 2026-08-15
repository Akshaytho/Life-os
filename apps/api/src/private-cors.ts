import type { IncomingMessage, ServerResponse } from "node:http";

const ALLOWED_METHODS = ["GET", "POST"] as const;
const ALLOWED_HEADERS = ["Authorization", "Content-Type", "Idempotency-Key"] as const;
const allowedHeaderNames = new Set(ALLOWED_HEADERS.map((value) => value.toLowerCase()));
const allowedMethodNames = new Set<string>(ALLOWED_METHODS);

export class PrivateCorsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivateCorsConfigurationError";
  }
}

export interface PrivateCorsPolicy {
  allowedOrigins: ReadonlySet<string>;
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PrivateCorsConfigurationError("LIFE_OS_CORS_ALLOWED_ORIGINS must contain only valid http(s) origins");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PrivateCorsConfigurationError("LIFE_OS_CORS_ALLOWED_ORIGINS must contain only valid http(s) origins");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new PrivateCorsConfigurationError(
      "LIFE_OS_CORS_ALLOWED_ORIGINS entries must be origins without credentials, paths, queries or fragments",
    );
  }

  return url.origin;
}

export function privateCorsPolicyFromEnv(env: NodeJS.ProcessEnv): PrivateCorsPolicy {
  const configured = optionalText(env.LIFE_OS_CORS_ALLOWED_ORIGINS);
  if (!configured) return { allowedOrigins: new Set() };

  const values = configured.split(",").map((value) => value.trim());
  if (values.some((value) => !value)) {
    throw new PrivateCorsConfigurationError("LIFE_OS_CORS_ALLOWED_ORIGINS must not contain empty entries");
  }

  return { allowedOrigins: new Set(values.map(normalizeOrigin)) };
}

export function appendVaryHeader(response: ServerResponse, ...fields: string[]): void {
  const current = response.getHeader("vary");
  const existing = Array.isArray(current)
    ? current.flatMap((value) => String(value).split(","))
    : current === undefined
      ? []
      : String(current).split(",");

  const byLowercase = new Map<string, string>();
  for (const value of [...existing, ...fields]) {
    const normalized = value.trim();
    if (normalized) byLowercase.set(normalized.toLowerCase(), normalized);
  }
  if (byLowercase.size > 0) response.setHeader("vary", [...byLowercase.values()].join(", "));
}

function originOf(request: IncomingMessage): string | undefined {
  const value = request.headers.origin;
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    return normalizeOrigin(value);
  } catch {
    return undefined;
  }
}

function jsonForbidden(response: ServerResponse, status: string): void {
  response.statusCode = 403;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "private, no-store");
  response.setHeader("pragma", "no-cache");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");
  response.end(JSON.stringify({ status }));
}

function requestedHeaders(request: IncomingMessage): string[] | undefined {
  const value = request.headers["access-control-request-headers"];
  if (value === undefined) return [];
  if (typeof value !== "string" || value.length > 2048) return undefined;
  const headers = value.split(",").map((header) => header.trim().toLowerCase()).filter(Boolean);
  return headers.every((header) => allowedHeaderNames.has(header)) ? headers : undefined;
}

/**
 * Applies the browser boundary only to private API requests.
 *
 * Returns true when the request is fully handled (preflight/rejection). Requests
 * without an Origin header continue unchanged so server-to-server tools and the
 * hosted preflight remain independent of browser CORS configuration.
 */
export function handlePrivateCors(
  request: IncomingMessage,
  response: ServerResponse,
  policy: PrivateCorsPolicy,
): boolean {
  const rawOrigin = request.headers.origin;
  if (rawOrigin === undefined) return false;

  appendVaryHeader(response, "Origin");
  const origin = originOf(request);
  if (!origin || !policy.allowedOrigins.has(origin)) {
    jsonForbidden(response, "origin_not_allowed");
    return true;
  }

  response.setHeader("access-control-allow-origin", origin);

  if (request.method !== "OPTIONS") return false;

  appendVaryHeader(response, "Access-Control-Request-Method", "Access-Control-Request-Headers");
  const requestedMethod = request.headers["access-control-request-method"];
  const headers = requestedHeaders(request);
  if (
    typeof requestedMethod !== "string"
    || !allowedMethodNames.has(requestedMethod.toUpperCase())
    || headers === undefined
  ) {
    jsonForbidden(response, "cors_preflight_rejected");
    return true;
  }

  response.statusCode = 204;
  response.setHeader("access-control-allow-methods", ALLOWED_METHODS.join(", "));
  response.setHeader("access-control-allow-headers", ALLOWED_HEADERS.join(", "));
  response.setHeader("access-control-max-age", "600");
  response.setHeader("cache-control", "private, no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.end();
  return true;
}
