import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";

export interface ReadinessProbe {
  check(): Promise<boolean>;
}

export interface ApiHealthDependencies {
  provenance: RuntimeProvenance;
  readiness: ReadinessProbe;
}

function json(response: ServerResponse, statusCode: number, payload: Record<string, string>, headOnly = false) {
  const body = JSON.stringify(payload);
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(headOnly ? undefined : body);
}

function pathOf(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? "/", "http://life-os.invalid").pathname;
  } catch {
    return "/invalid-request-target";
  }
}

/**
 * Handles only the public health routes. Returning false means the request belongs
 * to a different API surface and no response has been written yet.
 */
export async function handleLifeOsHealthRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApiHealthDependencies,
): Promise<boolean> {
  const path = pathOf(request);
  if (path !== "/health/live" && path !== "/health/ready") return false;

  const method = request.method ?? "GET";
  const headOnly = method === "HEAD";
  if (method !== "GET" && method !== "HEAD") {
    response.setHeader("allow", "GET, HEAD");
    json(response, 405, { status: "method_not_allowed" }, headOnly);
    return true;
  }

  if (path === "/health/live") {
    json(response, 200, { status: "ok" }, headOnly);
    return true;
  }

  try {
    const ready = await dependencies.readiness.check();
    json(response, ready ? 200 : 503, { status: ready ? "ready" : "not_ready" }, headOnly);
  } catch {
    // Readiness is deliberately sanitized. Database/provider errors belong to
    // technical telemetry, not to an unauthenticated public health response.
    json(response, 503, { status: "not_ready" }, headOnly);
  }
  return true;
}

export function createLifeOsHealthServer(dependencies: ApiHealthDependencies): Server {
  return createServer(async (request, response) => {
    if (await handleLifeOsHealthRequest(request, response, dependencies)) return;
    json(response, 404, { status: "not_found" }, request.method === "HEAD");
  });
}
