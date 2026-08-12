export type LifeOsEnvironment = "local" | "ci" | "development" | "production";

/**
 * Technical deployment provenance only. This is not a user life-history record.
 * It deliberately contains no raw Capture text, proposal payloads, credentials,
 * access tokens, database URLs, session material or arbitrary environment data.
 */
export interface RuntimeProvenance {
  environment: LifeOsEnvironment;
  releaseSha: string;
  deploymentId?: string;
  serviceName?: string;
  platform: "LOCAL" | "CI" | "RAILWAY" | "OTHER";
}
