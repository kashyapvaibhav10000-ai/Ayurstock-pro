import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decodeJwt, jwtVerify, SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || '');
// Same values as SESSION_IDLE_SECONDS / SESSION_ABSOLUTE_SECONDS in lib/auth.ts
// (duplicated: the proxy can't import Prisma).
const IDLE_SECONDS = 60 * 60 * 12;
const ABSOLUTE_SECONDS = 60 * 60 * 24 * 7;
// Re-sign at most this often per session, not on every request.
const REFRESH_AFTER_SECONDS = 60 * 10;

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

/**
 * Sliding refresh: a fresh cookie extending the session to IDLE_SECONDS from
 * now (capped at sst + ABSOLUTE_SECONDS), or null when the token should not be
 * extended. Throws if the token does not verify.
 */
async function refreshedCookie(token: string): Promise<string | null> {
  const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ['HS256'] });
  const now = Math.floor(Date.now() / 1000);

  // POS sessions never extend.
  if (payload.pos) return null;

  const sst = payload.sst;
  if (typeof payload.sid !== 'string' || typeof sst !== 'number' || sst + ABSOLUTE_SECONDS <= now) return null;
  if (now - (payload.iat ?? 0) <= REFRESH_AFTER_SECONDS) return null;

  // sid and sst stay unchanged in rest.
  const { iat: _iat, exp: _exp, ...rest } = payload;
  const exp = Math.min(now + IDLE_SECONDS, sst + ABSOLUTE_SECONDS);
  return new SignJWT(rest).setProtectedHeader({ alg: 'HS256' }).setIssuedAt(now).setExpirationTime(exp).sign(JWT_SECRET);
}

function setRefreshedCookie(response: NextResponse, token: string) {
  const exp = decodeJwt(token).exp as number;
  response.cookies.set('auth-token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: exp - Math.floor(Date.now() / 1000),
  });
}

export async function proxy(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value;

  if (request.nextUrl.pathname.startsWith('/api/')) {
    const rejection = crossOriginRejection(request) ?? oversizedRejection(request);
    if (rejection) return rejection;

    const response = NextResponse.next();
    if (!token) return response;
    try {
      const refreshed = await refreshedCookie(token);
      if (refreshed) setRefreshedCookie(response, refreshed);
    } catch {
      // Invalid token: the route itself answers 401.
    }
    return response;
  }

  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      const refreshed = await refreshedCookie(token);
      const response = NextResponse.next();
      if (refreshed) setRefreshedCookie(response, refreshed);
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
