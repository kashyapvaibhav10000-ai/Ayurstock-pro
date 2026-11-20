import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, createErrorResponse } from '@/middleware/auth';
import { confirmPassword, reauthLockedMessage } from '@/lib/user-guards';

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    const body = await request.json().catch(() => null);
    const password = body?.password;

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ success: false, error: 'Password is required' }, { status: 400 });
    }

    // An open session must not become an unthrottled password oracle: this
    // shares the per-user re-auth limit with every other password re-check.
    const reauth = await confirmPassword(auth.user.id, password);
    if (!reauth.ok && reauth.retryAfterSeconds) {
      return createErrorResponse(reauthLockedMessage(reauth.retryAfterSeconds), 429);
    }

    return NextResponse.json({ success: reauth.ok });
  } catch (error) {
    console.error('Verify password error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
