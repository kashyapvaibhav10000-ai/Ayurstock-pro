/**
 * Username rules, shared by the API and the UI (no server imports here).
 *
 * Usernames are optional, globally unique (the login screen has no shop
 * selector) and stored lowercase, so uniqueness is case-insensitive.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const USERNAME_HINT = '3–30 characters: a–z, 0–9, dot, underscore or hyphen, starting with a letter.';

const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{2,29}$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/** Validate an already-normalized username. Returns an error message or null. */
export function usernameError(username: string): string | null {
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters.`;
  }
  if (!/^[a-z]/.test(username)) return 'Username must start with a letter.';
  if (!USERNAME_PATTERN.test(username)) return 'Username can only use a–z, 0–9, dot, underscore and hyphen.';
  return null;
}

/**
 * Parse a username field from a request body.
 * undefined = not sent (leave unchanged), null = cleared.
 */
export function parseUsernameInput(
  value: unknown
): { ok: true; username: string | null | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, username: undefined };
  if (value === null) return { ok: true, username: null };
  if (typeof value !== 'string') return { ok: false, error: 'Username must be text.' };
  const username = normalizeUsername(value);
  if (!username) return { ok: true, username: null };
  const error = usernameError(username);
  return error ? { ok: false, error } : { ok: true, username };
}

/** Prisma unique-constraint violation on User.username. */
export function isUsernameConflict(error: unknown): boolean {
  const e = error as { code?: string; meta?: { target?: unknown } } | null;
  if (e?.code !== 'P2002') return false;
  const target = e.meta?.target;
  return Array.isArray(target) ? target.includes('username') : String(target ?? '').includes('username');
}

export const USERNAME_TAKEN = 'Username is already taken.';
