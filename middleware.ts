import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || '');
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    const token = request.cookies.get('auth-token')?.value;

    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      const response = NextResponse.next();

      // Sliding refresh: renew if token expires within 7 days
      // (wider window prevents expiry edge-cases on low-activity devices)
      const exp = payload.exp as number;
      const now = Math.floor(Date.now() / 1000);
      if (exp - now < SEVEN_DAYS_SECONDS) {
        const { iat: _iat, exp: _exp, ...rest } = payload;
        const newToken = await new SignJWT(rest)
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt()
          .setExpirationTime(`${THIRTY_DAYS_SECONDS}s`)
          .sign(JWT_SECRET);

        response.cookies.set('auth-token', newToken, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: THIRTY_DAYS_SECONDS,
        });
      }

      return response;
    } catch (err: unknown) {
      // Only clear cookie and redirect on genuine JWT errors (expired / invalid signature).
      // For unexpected errors (e.g. transient crypto failure during server restart),
      // let the request through so users are not logged out mid-session.
      const message = err instanceof Error ? err.message : String(err);
      const isJwtError =
        message.includes('JWTExpired') ||
        message.includes('JWSInvalid') ||
        message.includes('JWSSignatureVerificationFailed') ||
        message.includes('ERR_JWT') ||
        message.includes('invalid_token');

      if (isJwtError) {
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete('auth-token');
        return response;
      }

      // Unexpected error — allow through without deleting cookie
      console.error('[middleware] Unexpected JWT verify error:', message);
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
