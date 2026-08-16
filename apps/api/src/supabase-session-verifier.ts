import type { SessionVerifier, VerifiedUserSession } from "../../../packages/domain/trusted-transport-auth";

const INVALID_SESSION_STATUSES = new Set([400, 401, 403]);
const MAX_ACCESS_TOKEN_LENGTH = 4096;
const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class SupabaseSessionVerifierConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseSessionVerifierConfigurationError";
  }
}

export class SupabaseSessionVerificationUnavailableError extends Error {
  constructor() {
    super("Supabase authentication verification unavailable");
    this.name = "SupabaseSessionVerificationUnavailableError";
  }
}

export interface SupabaseSessionVerifierConfiguration {
  supabaseUrl: string;
  apiKey: string;
}

export interface SupabaseSessionVerifierOptions {
  fetchImpl?: typeof fetch;
}

function normalizedValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function requiredValue(value: string | undefined, name: string): string {
  const normalized = normalizedValue(value);
  if (!normalized) throw new SupabaseSessionVerifierConfigurationError(`${name} is required`);
  return normalized;
}

function normalizeSupabaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SupabaseSessionVerifierConfigurationError("SUPABASE_URL must be a valid project http(s) origin");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new SupabaseSessionVerifierConfigurationError("SUPABASE_URL must be a valid project http(s) origin");
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new SupabaseSessionVerifierConfigurationError(
      "SUPABASE_URL must be a project origin without credentials, path, query parameters or fragments",
    );
  }

  return url.origin;
}

export function supabaseSessionVerifierConfigurationFromEnv(
  env: NodeJS.ProcessEnv,
): SupabaseSessionVerifierConfiguration {
  const supabaseUrl = normalizeSupabaseUrl(requiredValue(env.SUPABASE_URL, "SUPABASE_URL"));
  const apiKey = requiredValue(
    normalizedValue(env.SUPABASE_PUBLISHABLE_KEY) ?? normalizedValue(env.SUPABASE_ANON_KEY),
    "SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY",
  );

  return { supabaseUrl, apiKey };
}

export function createSupabaseSessionVerifier(
  configuration: SupabaseSessionVerifierConfiguration,
  options: SupabaseSessionVerifierOptions = {},
): SessionVerifier {
  const baseUrl = normalizeSupabaseUrl(requiredValue(configuration.supabaseUrl, "SUPABASE_URL"));
  const apiKey = requiredValue(configuration.apiKey, "Supabase API key");
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async verify(credential: string): Promise<VerifiedUserSession | undefined> {
      const token = credential.trim();
      if (!token || token.length > MAX_ACCESS_TOKEN_LENGTH) return undefined;

      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/auth/v1/user`, {
          method: "GET",
          redirect: "error",
          headers: {
            Accept: "application/json",
            apikey: apiKey,
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        throw new SupabaseSessionVerificationUnavailableError();
      }

      if (INVALID_SESSION_STATUSES.has(response.status)) return undefined;
      if (!response.ok) throw new SupabaseSessionVerificationUnavailableError();

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new SupabaseSessionVerificationUnavailableError();
      }

      if (!body || typeof body !== "object" || !("id" in body)) {
        throw new SupabaseSessionVerificationUnavailableError();
      }

      const userId = (body as { id?: unknown }).id;
      if (typeof userId !== "string" || !canonicalUuidPattern.test(userId)) {
        throw new SupabaseSessionVerificationUnavailableError();
      }

      return { userId };
    },
  };
}

export function createSupabaseSessionVerifierFromEnv(
  env: NodeJS.ProcessEnv,
  options: SupabaseSessionVerifierOptions = {},
): SessionVerifier {
  return createSupabaseSessionVerifier(supabaseSessionVerifierConfigurationFromEnv(env), options);
}
