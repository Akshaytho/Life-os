import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { handleLifeOsHealthRequest, type ApiHealthDependencies } from "./api-health";
import { handlePrivateApiRequest, type PrivateApiDependencies } from "./private-api";

export interface LifeOsApiServerDependencies {
  health: ApiHealthDependencies;
  privateApi?: PrivateApiDependencies;
}

function pathOf(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? "/", "http://life-os.invalid").pathname;
  } catch {
    return "/invalid-request-target";
  }
}

function jsonNotFound(request: IncomingMessage, response: ServerResponse) {
  const headOnly = request.method === "HEAD";
  response.statusCode = 404;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(headOnly ? undefined : JSON.stringify({ status: "not_found" }));
}

/**
 * One long-running transport surface. Health routes remain public and process-owned.
 * Private routes exist only when reviewed private dependencies were explicitly composed.
 */
export async function handleLifeOsApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: LifeOsApiServerDependencies,
): Promise<void> {
  if (await handleLifeOsHealthRequest(request, response, dependencies.health)) return;

  if (dependencies.privateApi && pathOf(request).startsWith("/api/v1/")) {
    await handlePrivateApiRequest(request, response, dependencies.privateApi);
    return;
  }

  jsonNotFound(request, response);
}

export function createLifeOsApiServer(dependencies: LifeOsApiServerDependencies): Server {
  return createServer((request, response) => {
    void handleLifeOsApiRequest(request, response, dependencies);
  });
}
