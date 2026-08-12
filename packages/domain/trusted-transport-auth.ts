export interface VerifiedUserSession {
  userId: string;
}

export interface SessionVerifier {
  /**
   * Verifies one opaque transport credential.
   * Return undefined for an unusable session. Throw only when verification itself is unavailable.
   */
  verify(credential: string): Promise<VerifiedUserSession | undefined>;
}

export interface TransportRequestIdGenerator {
  next(): string;
}

export interface TransportClock {
  now(): string;
}
