import { NextRequest } from 'next/server';
import { authenticateRequest } from '@/middleware/auth';
import { AuthUser } from '@/types';

/**
 * Super-admins manage platform-wide settings (AI provider keys). A
 * super-admin is an ADMIN whose email is listed in SUPER_ADMIN_EMAILS or
 * whose username is listed in SUPER_ADMIN_USERNAMES (comma-separated,
 * case-insensitive). No allowlist = no super-admins.
 */
function allowlist(name: 'SUPER_ADMIN_EMAILS' | 'SUPER_ADMIN_USERNAMES'): Set<string> {
  return new Set(
    (process.env[name] || '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isSuperAdmin(user: Pick<AuthUser, 'role' | 'email' | 'username'> | null | undefined): boolean {
  return superAdminVia(user).length > 0;
}

/**
 * Which identifiers make this user a super-admin. The UI warns before the
 * user changes one of them, since the allowlist lives in the server .env.
 */
export function superAdminVia(
  user: { role: string; email?: string | null; username?: string | null } | null | undefined
): Array<'email' | 'username'> {
  if (!user || user.role !== 'ADMIN') return [];
  const via: Array<'email' | 'username'> = [];
  if (user.email && allowlist('SUPER_ADMIN_EMAILS').has(user.email.trim().toLowerCase())) via.push('email');
  if (user.username && allowlist('SUPER_ADMIN_USERNAMES').has(user.username.trim().toLowerCase())) via.push('username');
  return via;
}

/** Authenticated super-admin for this request, or null. */
export async function requireSuperAdmin(request: NextRequest): Promise<AuthUser | null> {
  const auth = await authenticateRequest(request);
  if (!auth || !isSuperAdmin(auth.user)) return null;
  return auth.user;
}
