export const MAX_AUTH_EMAIL_LENGTH = 320;
export const MAX_AUTH_PASSWORD_LENGTH = 4096;

export type PreparedSignInCredentials =
  | { ok: true; email: string; password: string }
  | { ok: false; message: string };

export type PreparedRecoveryEmail =
  | { ok: true; email: string }
  | { ok: false; message: string };

export type PreparedRecoveredPassword =
  | { ok: true; password: string }
  | { ok: false; message: string };

export function normalizeAuthEmail(value: string): string {
  return value.trim();
}

export function prepareSignInCredentials(email: string, password: string): PreparedSignInCredentials {
  const normalizedEmail = normalizeAuthEmail(email);

  if (!normalizedEmail || !password) {
    return { ok: false, message: "Enter both email and password." };
  }
  if (normalizedEmail.length > MAX_AUTH_EMAIL_LENGTH || password.length > MAX_AUTH_PASSWORD_LENGTH) {
    return { ok: false, message: "Email or password is too long." };
  }

  return { ok: true, email: normalizedEmail, password };
}

export function prepareRecoveryEmail(email: string): PreparedRecoveryEmail {
  const normalizedEmail = normalizeAuthEmail(email);
  if (!normalizedEmail) return { ok: false, message: "Enter your email address." };
  if (normalizedEmail.length > MAX_AUTH_EMAIL_LENGTH) return { ok: false, message: "Email is too long." };
  return { ok: true, email: normalizedEmail };
}

export function prepareRecoveredPassword(password: string, confirmation: string): PreparedRecoveredPassword {
  if (!password || !confirmation) return { ok: false, message: "Enter and confirm your new password." };
  if (password.length > MAX_AUTH_PASSWORD_LENGTH || confirmation.length > MAX_AUTH_PASSWORD_LENGTH) {
    return { ok: false, message: "Password is too long." };
  }
  if (password !== confirmation) return { ok: false, message: "The new passwords do not match." };
  return { ok: true, password };
}
