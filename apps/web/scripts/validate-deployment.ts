import {
  WebDeploymentConfigurationError,
  webDeploymentConfigurationFromEnv,
} from "../lib/web-deployment";

try {
  const configuration = webDeploymentConfigurationFromEnv(process.env);
  console.log(JSON.stringify({
    status: "web_deployment_configuration_ready",
    mode: configuration.mode,
    directionEnabled: configuration.directionEnabled,
  }));
} catch (error) {
  const configurationError = error instanceof WebDeploymentConfigurationError ? error : undefined;
  console.error(JSON.stringify({
    status: "web_deployment_configuration_failed",
    errorCode: configurationError?.code ?? "CONFIGURATION_INVALID",
  }));
  process.exitCode = 1;
}
