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
  if (!user || user.role !== 'ADMIN') return false;
  if (user.email && allowlist('SUPER_ADMIN_EMAILS').has(user.email.trim().toLowerCase())) return true;
  return Boolean(user.username && allowlist('SUPER_ADMIN_USERNAMES').has(user.username.trim().toLowerCase()));
}

/** Authenticated super-admin for this request, or null. */
export async function requireSuperAdmin(request: NextRequest): Promise<AuthUser | null> {
  const auth = await authenticateRequest(request);
  if (!auth || !isSuperAdmin(auth.user)) return null;
  return auth.user;
}
