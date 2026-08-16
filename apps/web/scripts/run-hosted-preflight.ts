import {
  runWebHostedPreflight,
  webHostedPreflightConfigurationFromEnv,
  WebHostedPreflightConfigurationError,
} from "./hosted-preflight";

async function main() {
  if (process.argv.slice(2).length > 0) {
    throw new WebHostedPreflightConfigurationError("DIRECTION_EXPECTATION_INVALID");
  }

  const configuration = webHostedPreflightConfigurationFromEnv(process.env);
  const report = await runWebHostedPreflight(configuration);

  console.log(JSON.stringify({
    status: report.status === "READY" ? "web_hosted_preflight_ready" : "web_hosted_preflight_failed",
    result: report.status,
    requestsIssued: report.requestsIssued,
    writeAttempts: report.writeAttempts,
    checks: report.checks,
  }, undefined, 2));

  if (report.status !== "READY") process.exitCode = 1;
}

void main().catch((error: unknown) => {
  const configurationError = error instanceof WebHostedPreflightConfigurationError ? error : undefined;
  console.error(JSON.stringify({
    status: "web_hosted_preflight_failed",
    errorCode: configurationError?.code ?? "PREFLIGHT_FAILED",
  }));
  process.exitCode = 1;
});
