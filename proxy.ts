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

/**
 * Content-Security-Policy with a per-request script nonce. Next.js reads the
 * nonce from the request's CSP header and puts it on its own scripts;
 * 'strict-dynamic' lets those scripts load the rest (chunks, pdf.js and
 * tesseract.js workers). Browsers that support 'strict-dynamic' ignore the
 * host sources in script-src; they're a fallback for older ones. Inline styles stay allowed: Tailwind/Radix/sonner set style
 * attributes and the invoice templates inject <style> blocks.
 *
 * Third parties the browser talks to: Google Fonts (POS icon font), the
 * pdf.js worker on cdnjs, and tesseract.js (worker, wasm core and language
 * data from jsdelivr / projectnaptha) for in-browser OCR. 'wasm-unsafe-eval'
 * is for tesseract's wasm core; dev mode also needs eval and the HMR socket.
 */
export function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== 'production';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''} https://cdnjs.cloudflare.com https://cdn.jsdelivr.net`,
    "worker-src 'self' blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://tessdata.projectnaptha.com${isDev ? ' ws:' : ''}`,
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** CSP_REPORT_ONLY=1 reports violations without blocking (for rollout). */
function cspHeaderName(): string {
  return process.env.CSP_REPORT_ONLY === '1' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
}

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
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  const cspHeader = cspHeaderName();

  // Request headers: Next.js takes the nonce from here for its own scripts,
  // and server components read x-nonce.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set(cspHeader, csp);
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });

  const response = await route(request, next);
  response.headers.set(cspHeader, csp);
  return response;
}

async function route(request: NextRequest, next: () => NextResponse): Promise<NextResponse> {
  const token = request.cookies.get('auth-token')?.value;

  if (request.nextUrl.pathname.startsWith('/api/')) {
    const rejection = crossOriginRejection(request) ?? oversizedRejection(request);
    if (rejection) return rejection;

    const response = next();
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
      const response = next();
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

  return next();
}

export const config = {
  // Every API route (CSRF, size limit), plus every page (CSP nonce). Build
  // output, image optimizer, favicon and static files from public/ skip it.
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|otf|css|js|mjs|map|wasm|txt|xml|json)$).*)',
  ],
};
