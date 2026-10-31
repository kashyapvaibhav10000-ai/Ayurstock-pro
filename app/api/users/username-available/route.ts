import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { normalizeUsername, usernameError } from '@/lib/username';

/**
 * GET /api/users/username-available?username=…&userId=…
 * Live availability check for the profile and team forms. userId (admins,
 * same shop only) names the user being edited, so their current username
 * counts as available; otherwise the caller's own username does.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    // Slows down using this endpoint to list usernames.
    const limit = rateLimit(`username-check:${auth.user.id}`, 60, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ success: false, message: 'Too many checks. Slow down.' }, { status: 429 });
    }

    const params = req.nextUrl.searchParams;
    const username = normalizeUsername(params.get('username') || '');
    const error = usernameError(username);
    if (error) {
      return NextResponse.json({ success: true, username, valid: false, available: false, message: error });
    }

    let ownerId = auth.user.id;
    const targetId = params.get('userId');
    if (targetId && targetId !== auth.user.id && auth.user.role === 'ADMIN') {
      const target = await prisma.user.findFirst({ where: { id: targetId, shopId: auth.user.shopId }, select: { id: true } });
      if (target) ownerId = target.id;
    }

    const owner = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    const available = !owner || owner.id === ownerId;
    return NextResponse.json({
      success: true,
      username,
      valid: true,
      available,
      message: available ? 'Username is available.' : 'Username is already taken.',
    });
  } catch (error) {
    console.error('Username availability error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
