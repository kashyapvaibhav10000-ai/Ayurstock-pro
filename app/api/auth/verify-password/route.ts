import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createErrorResponse } from '@/middleware/auth';
import { verifyPassword } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    // An open session must not become an unthrottled password oracle.
    const limit = await rateLimit(`verify-pw:${auth.user.id}`, 5, 15 * 60_000);
    if (!limit.allowed) {
      return createErrorResponse(`Too many password checks. Try again in ${limit.retryAfterSeconds}s.`, 429);
    }

    const body = await request.json();
    const { password } = body;

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ success: false, error: 'Password is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { passwordHash: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const isValid = await verifyPassword(password, user.passwordHash);

    return NextResponse.json({ success: isValid });
  } catch (error) {
    console.error('Verify password error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
