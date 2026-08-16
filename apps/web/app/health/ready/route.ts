import {
  WebDeploymentConfigurationError,
  webDeploymentConfigurationFromEnv,
} from "../../../lib/web-deployment";

export const dynamic = "force-dynamic";

function environment() {
  return {
    LIFE_OS_WEB_DEPLOYMENT: process.env.LIFE_OS_WEB_DEPLOYMENT,
    NEXT_PUBLIC_LIFE_OS_API_BASE_URL: process.env.NEXT_PUBLIC_LIFE_OS_API_BASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_LIFE_OS_DIRECTION_ENABLED: process.env.NEXT_PUBLIC_LIFE_OS_DIRECTION_ENABLED,
  };
}

export function GET() {
  try {
    const configuration = webDeploymentConfigurationFromEnv(environment());
    if (configuration.mode !== "live") {
      return Response.json(
        { status: "not_ready", reason: "live_mode_required" },
        {
          status: 503,
          headers: {
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          },
        },
      );
    }

    return Response.json(
      {
        status: "ready",
        mode: "live",
        direction: configuration.directionEnabled ? "enabled" : "dormant",
      },
      {
        status: 200,
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      },
    );
  } catch (error) {
    const code = error instanceof WebDeploymentConfigurationError ? error.code : "CONFIGURATION_INVALID";
    return Response.json(
      { status: "not_ready", reason: code },
      {
        status: 503,
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      },
    );
  }
}
