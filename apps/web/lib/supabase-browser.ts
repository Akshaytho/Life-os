import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class BrowserAuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserAuthConfigurationError";
  }
}

let browserClient: SupabaseClient | undefined;

function requiredPublicValue(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new BrowserAuthConfigurationError(`${name} is required for live browser authentication`);
  return normalized;
}

function normalizeSupabaseOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BrowserAuthConfigurationError("NEXT_PUBLIC_SUPABASE_URL must be a valid http(s) origin");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BrowserAuthConfigurationError("NEXT_PUBLIC_SUPABASE_URL must be a valid http(s) origin");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new BrowserAuthConfigurationError(
      "NEXT_PUBLIC_SUPABASE_URL must be an origin without credentials, path, query parameters or fragments",
    );
  }
  return url.origin;
}

export function getBrowserSupabaseClient(): SupabaseClient {
  if (typeof window === "undefined") {
    throw new BrowserAuthConfigurationError("Browser authentication can only be initialized in the browser");
  }
  if (browserClient) return browserClient;

  const url = normalizeSupabaseOrigin(
    requiredPublicValue(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
  );
  const publishableKey = requiredPublicValue(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );

  browserClient = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return browserClient;
}
