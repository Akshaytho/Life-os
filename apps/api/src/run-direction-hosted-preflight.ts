import { runDirectionHostedPreflight } from "./direction-hosted-preflight";
import {
  HostedPreflightConfigurationError,
  hostedPreflightConfigurationFromEnv,
} from "./hosted-preflight";

async function main() {
  if (process.argv.slice(2).length > 0) {
    throw new HostedPreflightConfigurationError("Direction hosted preflight CLI accepts no arguments");
  }

  const configuration = hostedPreflightConfigurationFromEnv(process.env);
  const report = await runDirectionHostedPreflight(configuration);

  // Safe operator receipt only: no URL, token, Direction text, user ID or row data.
  console.log(JSON.stringify({
    status: report.status === "READY" ? "direction_hosted_preflight_ready" : "direction_hosted_preflight_failed",
    result: report.status,
    requestsIssued: report.requestsIssued,
    privateWriteAttempts: report.privateWriteAttempts,
    baseline: report.baseline.status,
    direction: report.direction,
  }, undefined, 2));

  if (report.status !== "READY") process.exitCode = 1;
}

void main().catch((error: unknown) => {
  const configurationError = error instanceof HostedPreflightConfigurationError ? error : undefined;
  console.error(JSON.stringify({
    status: "direction_hosted_preflight_failed",
    errorCode: configurationError ? "CONFIGURATION_INVALID" : "PREFLIGHT_FAILED",
  }));
  process.exitCode = 1;
});
