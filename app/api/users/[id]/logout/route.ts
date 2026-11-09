import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

/**
 * POST /api/users/[id]/logout: an admin signs a team member out of every
 * device. Bumping tokenVersion makes all their current sessions invalid;
 * their open pages are sent to the login screen on the next check.
 * The account stays active, so they can sign in again.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: userId } = await params;
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) return fail('Unauthorized', 401);
    if (auth.user.role !== 'ADMIN') return fail('Forbidden: Admins only', 403);
    if (userId === auth.user.id) return fail('Use Logout to sign yourself out');

    const target = await prisma.user.findFirst({
      where: { id: userId, shopId: auth.user.shopId, deletedAt: null },
      select: { id: true, role: true, name: true },
    });
    if (!target) return fail('User not found', 404);
    // Same rule as delete/deactivate: admins cannot act on other admins.
    if (target.role === 'ADMIN') return fail('Cannot log out another Admin account', 403);

    await prisma.user.update({ where: { id: target.id }, data: { tokenVersion: { increment: 1 } } });
    await prisma.activityLog.create({
      data: {
        shopId: auth.user.shopId,
        userId: auth.user.id,
        action: 'FORCE_LOGOUT_USER',
        meta: JSON.stringify({ targetUserId: target.id, targetRole: target.role }),
      },
    });

    return NextResponse.json({ success: true, message: `${target.name} has been logged out` });
  } catch (error) {
    console.error('Force logout error:', error);
    return fail('Internal server error', 500);
  }
}
