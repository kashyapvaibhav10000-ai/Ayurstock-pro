/**
 * Client-safe: the warning shown before a super-admin changes the email or
 * username that the server .env allowlist matches. Returns null when the
 * change does not touch a super-admin identifier.
 */
export function superAdminIdentifierWarning(
  via: Array<'email' | 'username'> | undefined,
  changed: { email: boolean; username: boolean }
): string | null {
  const envVar =
    via?.includes('username') && changed.username
      ? 'SUPER_ADMIN_USERNAMES'
      : via?.includes('email') && changed.email
        ? 'SUPER_ADMIN_EMAILS'
        : null;
  if (!envVar) return null;
  return `Super-admin is tied to this identifier in server .env (${envVar}). Update it on the server or you lose AI settings access.`;
}
