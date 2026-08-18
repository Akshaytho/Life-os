import {
  journeyCapabilityCodes,
  journeyCodes,
  soundDesignTechniqueCodes,
  type JourneyCapabilityCode,
  type JourneyCode,
  type SoundDesignTechniqueCode,
} from "../../../packages/contracts/journey-practice";

export type JourneyPracticeErrorCode =
  | "INVALID_PRINCIPAL"
  | "INVALID_JOURNEY"
  | "INVALID_CAPABILITY"
  | "INVALID_TECHNIQUE"
  | "INVALID_NOTE"
  | "INVALID_SESSION"
  | "INVALID_DECISION"
  | "IDEMPOTENCY_REQUIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "JOURNEY_ALREADY_ACTIVATED"
  | "JOURNEY_ACTIVATION_REQUIRED"
  | "OPEN_PRACTICE_SESSION_EXISTS"
  | "PRACTICE_SESSION_NOT_FOUND"
  | "PRACTICE_SESSION_ALREADY_COMPLETED";

export class JourneyPracticeError extends Error {
  constructor(readonly code: JourneyPracticeErrorCode) {
    super(code);
    this.name = "JourneyPracticeError";
  }
}

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const validJourneys = new Set<JourneyCode>(journeyCodes);
const validCapabilities = new Set<JourneyCapabilityCode>(journeyCapabilityCodes);
const validTechniques = new Set<SoundDesignTechniqueCode>(soundDesignTechniqueCodes);

export function requiredJourneyOpaqueId(
  value: string,
  code: JourneyPracticeErrorCode,
): string {
  const normalized = value.trim();
  if (!opaqueIdPattern.test(normalized)) throw new JourneyPracticeError(code);
  return normalized;
}

export function requiredJourneyRequestId(
  value: string,
  scope: "journey_activate" | "journey_practice_start" | "journey_practice_complete",
): string {
  const normalized = requiredJourneyOpaqueId(value, "IDEMPOTENCY_REQUIRED");
  const prefix = `web-idem-v1:${scope}:`;
  if (!normalized.startsWith(prefix) || !/^[0-9a-f]{64}$/.test(normalized.slice(prefix.length))) {
    throw new JourneyPracticeError("IDEMPOTENCY_REQUIRED");
  }
  return normalized;
}

export function normalizedJourneyCode(value: JourneyCode): JourneyCode {
  if (!validJourneys.has(value)) throw new JourneyPracticeError("INVALID_JOURNEY");
  return value;
}

export function normalizedJourneyCapability(value: JourneyCapabilityCode): JourneyCapabilityCode {
  if (!validCapabilities.has(value)) throw new JourneyPracticeError("INVALID_CAPABILITY");
  return value;
}

export function normalizedJourneyTechnique(value: SoundDesignTechniqueCode): SoundDesignTechniqueCode {
  if (!validTechniques.has(value)) throw new JourneyPracticeError("INVALID_TECHNIQUE");
  return value;
}

export function normalizedJourneyNote(
  value: string | undefined,
  maximum = 4000,
): string | undefined {
  if (value === undefined || value.trim().length === 0) return undefined;
  if (value.length > maximum) throw new JourneyPracticeError("INVALID_NOTE");
  return value;
}

export function normalizedJourneyInstant(value: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new JourneyPracticeError("INVALID_DECISION");
  return new Date(milliseconds).toISOString();
}
