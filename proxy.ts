import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || '');
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;

// Largest request body any route accepts (invoice / price-list uploads).
export const MAX_BODY_BYTES = 20 * 1024 * 1024;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Hosts this app is served on: the request's own Host plus APP_ORIGINS. */
function allowedHosts(request: NextRequest): Set<string> {
  const hosts = new Set<string>();
  const host = request.headers.get('host');
  if (host) hosts.add(host.toLowerCase());
  for (const origin of (process.env.APP_ORIGINS || '').split(',')) {
    try {
      if (origin.trim()) hosts.add(new URL(origin.trim()).host.toLowerCase());
    } catch {
      // ignore malformed entries
    }
  }
  return hosts;
}

/**
 * CSRF: a state-changing API call must come from our own pages. Browsers
 * send Origin on every cross-origin request and on same-origin non-GET
 * fetches, so a foreign or "null" Origin is refused. Requests with no Origin
 * and no Sec-Fetch-Site are not from a browser page and carry no ambient
 * cookie risk.
 */
export function crossOriginRejection(request: NextRequest): NextResponse | null {
  if (SAFE_METHODS.has(request.method)) return null;

  const origin = request.headers.get('origin');
  if (origin) {
    let host: string | null = null;
    try {
      host = new URL(origin).host.toLowerCase();
    } catch {
      host = null;
    }
    if (!host || !allowedHosts(request).has(host)) {
      return NextResponse.json({ success: false, error: 'Cross-origin request refused' }, { status: 403 });
    }
    return null;
  }

  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    return NextResponse.json({ success: false, error: 'Cross-origin request refused' }, { status: 403 });
  }
  return null;
}

/** Refuse oversized bodies before any route buffers them. */
export function oversizedRejection(request: NextRequest): NextResponse | null {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY_BYTES) {
    return NextResponse.json({ success: false, error: 'Request body too large (max 20 MB)' }, { status: 413 });
  }
  return null;
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return crossOriginRejection(request) ?? oversizedRejection(request) ?? NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    const token = request.cookies.get('auth-token')?.value;

    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ['HS256'] });
      const response = NextResponse.next();

      // Sliding refresh: renew if token expires within 7 days
      // (wider window prevents expiry edge-cases on low-activity devices)
      const exp = payload.exp as number;
      const now = Math.floor(Date.now() / 1000);
      if (!payload.pos && exp - now < SEVEN_DAYS_SECONDS) {
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
    } catch {
      // Fail closed: any verification failure (expired, bad signature,
      // missing secret) sends the user to log in again. The dashboard layout
      // re-checks the session against the database as well.
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('auth-token');
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};
