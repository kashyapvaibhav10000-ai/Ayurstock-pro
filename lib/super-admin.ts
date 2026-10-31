import { NextRequest } from 'next/server';
import { authenticateRequest } from '@/middleware/auth';
import { AuthUser } from '@/types';

/**
 * Super-admins manage platform-wide settings (AI provider keys). A
 * super-admin is an active ADMIN whose user id is listed in
 * SUPER_ADMIN_USER_IDS (comma-separated). Ids never change, so editing an
 * email or username can neither grant nor lose the role. No list = no
 * super-admins.
 */
function allowedIds(): Set<string> {
  return new Set(
    (process.env.SUPER_ADMIN_USER_IDS || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

export function isSuperAdmin(user: Pick<AuthUser, 'id' | 'role'> | null | undefined): boolean {
  return Boolean(user && user.role === 'ADMIN' && allowedIds().has(user.id));
}

/** Authenticated super-admin for this request, or null. */
export async function requireSuperAdmin(request: NextRequest): Promise<AuthUser | null> {
  const auth = await authenticateRequest(request);
  if (!auth || !isSuperAdmin(auth.user)) return null;
  return auth.user;
}
