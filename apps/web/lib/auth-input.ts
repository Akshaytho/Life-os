export const MAX_AUTH_EMAIL_LENGTH = 320;
export const MAX_AUTH_PASSWORD_LENGTH = 4096;

export type PreparedSignInCredentials =
  | { ok: true; email: string; password: string }
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
