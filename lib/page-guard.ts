import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthUserFromToken } from '@/lib/auth';
import { UserRole } from '@/types';

/** Session user for this render (one DB lookup per request, shared by layouts). */
export const getPageUser = cache(async () => {
  const token = (await cookies()).get('auth-token')?.value;
  return token ? getAuthUserFromToken(token) : null;
});

/**
 * Server-side page access. Hiding a menu item is not enough: a cashier who
 * types /dashboard/purchases is sent to billing before anything renders.
 */
export async function requirePageRole(roles: UserRole[]) {
  const user = await getPageUser();
  if (!user) redirect('/login');
  if (!roles.includes(user.role)) redirect('/dashboard/billing');
  return user;
}
