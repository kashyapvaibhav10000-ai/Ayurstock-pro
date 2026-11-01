import { NextRequest, NextResponse } from 'next/server';
import { extractRequestToken, revokeSession, verifyToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  // Revoke server-side so a copied token stops working too. Logout always
  // clears the cookie, even if revocation fails.
  try {
    const token = extractRequestToken(request);
    const payload = token ? verifyToken(token) : null;
    if (payload) await revokeSession(payload);
  } catch (error) {
    console.error('Session revocation failed:', error);
  }

  const response = NextResponse.json({
    success: true,
    message: 'Logged out successfully',
  });

  response.cookies.set('auth-token', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  return response;
}
