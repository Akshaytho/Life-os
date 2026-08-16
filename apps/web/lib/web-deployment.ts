export type WebDeploymentMode = "prototype" | "live";

export interface WebDeploymentConfiguration {
  mode: WebDeploymentMode;
  apiOrigin?: string;
  supabaseOrigin?: string;
  directionEnabled: boolean;
}

export class WebDeploymentConfigurationError extends Error {
  constructor(
    readonly code:
      | "MODE_INVALID"
      | "API_ORIGIN_REQUIRED"
      | "API_ORIGIN_INVALID"
      | "SUPABASE_ORIGIN_REQUIRED"
      | "SUPABASE_ORIGIN_INVALID"
      | "SUPABASE_PUBLISHABLE_KEY_REQUIRED"
      | "SUPABASE_PUBLISHABLE_KEY_INVALID"
      | "DIRECTION_FLAG_INVALID",
  ) {
    super(code);
    this.name = "WebDeploymentConfigurationError";
  }
}

type WebDeploymentEnvironment = Partial<Pick<
  NodeJS.ProcessEnv,
  | "LIFE_OS_WEB_DEPLOYMENT"
  | "NEXT_PUBLIC_LIFE_OS_API_BASE_URL"
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  | "NEXT_PUBLIC_LIFE_OS_DIRECTION_ENABLED"
>>;

function normalized(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result || undefined;
}

function parseMode(value: string | undefined): WebDeploymentMode {
  const mode = normalized(value)?.toLowerCase();
  if (mode === undefined || mode === "prototype") return "prototype";
  if (mode === "live") return "live";
  throw new WebDeploymentConfigurationError("MODE_INVALID");
}

function parseBooleanFlag(value: string | undefined): boolean {
  const flag = normalized(value)?.toLowerCase();
  if (flag === undefined || flag === "false") return false;
  if (flag === "true") return true;
  throw new WebDeploymentConfigurationError("DIRECTION_FLAG_INVALID");
}

function httpsOrigin(
  value: string | undefined,
  requiredCode: "API_ORIGIN_REQUIRED" | "SUPABASE_ORIGIN_REQUIRED",
  invalidCode: "API_ORIGIN_INVALID" | "SUPABASE_ORIGIN_INVALID",
): string {
  const raw = normalized(value);
  if (!raw) throw new WebDeploymentConfigurationError(requiredCode);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebDeploymentConfigurationError(invalidCode);
  }

  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new WebDeploymentConfigurationError(invalidCode);
  }
  return url.origin;
}

function publishableKey(value: string | undefined): string {
  const key = normalized(value);
  if (!key) throw new WebDeploymentConfigurationError("SUPABASE_PUBLISHABLE_KEY_REQUIRED");

  // Hosted Life OS uses Supabase's current browser-safe publishable-key format.
  // Requiring the explicit public prefix makes accidental sb_secret_* exposure
  // fail the build before any browser bundle can be deployed.
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw new WebDeploymentConfigurationError("SUPABASE_PUBLISHABLE_KEY_INVALID");
  }
  return key;
}

export function webDeploymentConfigurationFromEnv(
  env: WebDeploymentEnvironment,
): WebDeploymentConfiguration {
  const mode = parseMode(env.LIFE_OS_WEB_DEPLOYMENT);
  const directionEnabled = parseBooleanFlag(env.NEXT_PUBLIC_LIFE_OS_DIRECTION_ENABLED);

  if (mode === "prototype") {
    return { mode, directionEnabled };
  }

  const apiOrigin = httpsOrigin(
    env.NEXT_PUBLIC_LIFE_OS_API_BASE_URL,
    "API_ORIGIN_REQUIRED",
    "API_ORIGIN_INVALID",
  );
  const supabaseOrigin = httpsOrigin(
    env.NEXT_PUBLIC_SUPABASE_URL,
    "SUPABASE_ORIGIN_REQUIRED",
    "SUPABASE_ORIGIN_INVALID",
  );
  publishableKey(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  return {
    mode,
    apiOrigin,
    supabaseOrigin,
    directionEnabled,
  };
}
