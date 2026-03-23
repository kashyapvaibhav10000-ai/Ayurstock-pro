import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || '');
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
const ONE_DAY_SECONDS = 60 * 60 * 24;

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    const token = request.cookies.get('auth-token')?.value;

    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      const response = NextResponse.next();

      // Sliding refresh: if token expires within 24h, issue a fresh 30-day token
      const exp = payload.exp as number;
      const now = Math.floor(Date.now() / 1000);
      if (exp - now < ONE_DAY_SECONDS) {
        const { iat, exp: _exp, ...rest } = payload;
        void iat; // suppress unused warning
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
    } catch {
      // Token is invalid or expired — clear it and redirect
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('auth-token');
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
