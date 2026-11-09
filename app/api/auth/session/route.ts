import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/session: cheap "is my session still valid?" check. Open
 * dashboard pages poll it so a user an admin logged out (or deactivated)
 * is sent to the login screen within a minute, not on their next action.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.authenticated || !auth.user) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ success: true });
}
