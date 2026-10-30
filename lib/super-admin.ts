import { NextRequest } from 'next/server';
import { authenticateRequest } from '@/middleware/auth';
import { AuthUser } from '@/types';

/**
 * Super-admins manage platform-wide settings (AI provider keys). A
 * super-admin is an ADMIN whose email is listed in SUPER_ADMIN_EMAILS
 * (comma-separated, case-insensitive). No allowlist = no super-admins.
 */
function superAdminEmails(): Set<string> {
  return new Set(
    (process.env.SUPER_ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isSuperAdmin(user: Pick<AuthUser, 'role' | 'email'> | null | undefined): boolean {
  if (!user || user.role !== 'ADMIN' || !user.email) return false;
  return superAdminEmails().has(user.email.trim().toLowerCase());
}

/** Authenticated super-admin for this request, or null. */
export async function requireSuperAdmin(request: NextRequest): Promise<AuthUser | null> {
  const auth = await authenticateRequest(request);
  if (!auth || !isSuperAdmin(auth.user)) return null;
  return auth.user;
}
