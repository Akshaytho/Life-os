import { createHash } from "node:crypto";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";

export class WebWriteIdempotencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebWriteIdempotencyError";
  }
}

export type WebWriteIdempotencyScope = "CAPTURE_CREATE";

const keyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;

function requireIdempotencyKey(value: string | undefined): string {
  if (typeof value !== "string" || !keyPattern.test(value)) {
    throw new WebWriteIdempotencyError(
      "Idempotency-Key must be an opaque 16-128 character token using letters, numbers, dot, underscore, colon or hyphen",
    );
  }
  return value;
}

function requireTrustedUser(context: WriteRequestContext): string {
  const userId = context.principal.userId;
  if (context.principal.actorType !== "USER" || typeof userId !== "string" || !userId.trim()) {
    throw new WebWriteIdempotencyError("A trusted authenticated user context is required before deriving write idempotency");
  }
  return userId;
}

export function withWebWriteIdempotency(
  context: WriteRequestContext,
  scope: WebWriteIdempotencyScope,
  untrustedIdempotencyKey: string | undefined,
): WriteRequestContext {
  const userId = requireTrustedUser(context);
  const key = requireIdempotencyKey(untrustedIdempotencyKey);
  const digest = createHash("sha256")
    .update(JSON.stringify({ version: 1, userId, scope, key }))
    .digest("hex");

  return {
    ...context,
    principal: { ...context.principal },
    requestId: `web-idem-v1:${scope.toLowerCase()}:${digest}`,
  };
}
