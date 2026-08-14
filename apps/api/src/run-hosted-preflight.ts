import {
  HostedPreflightConfigurationError,
  hostedPreflightConfigurationFromEnv,
  runHostedPreflight,
} from "./hosted-preflight";

async function main() {
  if (process.argv.slice(2).length > 0) {
    throw new HostedPreflightConfigurationError("Hosted preflight CLI accepts no arguments");
  }

  const configuration = hostedPreflightConfigurationFromEnv(process.env);
  const report = await runHostedPreflight(configuration);

  // The report intentionally carries no base URL, token, connection string or
  // row data, so it is safe to print in CI and operator terminals.
  console.log(JSON.stringify({
    status: report.status === "READY" ? "hosted_preflight_ready" : "hosted_preflight_failed",
    result: report.status,
    requestsIssued: report.requestsIssued,
    privateWriteAttempts: report.privateWriteAttempts,
    checks: report.checks,
  }, undefined, 2));

  if (report.status !== "READY") process.exitCode = 1;
}

void main().catch((error: unknown) => {
  const configurationError = error instanceof HostedPreflightConfigurationError ? error : undefined;
  console.error(JSON.stringify({
    status: "hosted_preflight_failed",
    errorCode: configurationError ? "CONFIGURATION_INVALID" : "PREFLIGHT_FAILED",
  }));
  process.exitCode = 1;
});

