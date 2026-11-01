/**
 * Nonce-based Content-Security-Policy set by the proxy.
 */
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { afterEach, describe, expect, it } from 'vitest';
import { config, proxy } from '@/proxy';

const page = (path: string) => proxy(new NextRequest(new URL(path, 'https://shop.example.com')));

function directive(csp: string | null, name: string): string {
  const found = (csp ?? '').split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `));
  return found ?? '';
}

const nonceOf = (csp: string | null) => directive(csp, 'script-src').match(/'nonce-([^']+)'/)?.[1];

afterEach(() => {
  delete process.env.CSP_REPORT_ONLY;
});

describe('CSP nonce', () => {
  it('page responses carry a nonce in script-src and no unsafe-inline for scripts', async () => {
    const res = await page('/login');
    const csp = res.headers.get('content-security-policy');
    const scriptSrc = directive(csp, 'script-src');
    expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]{20,}'/);
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    // Existing directives are kept.
    expect(directive(csp, 'connect-src')).toContain('https://tessdata.projectnaptha.com');
    expect(directive(csp, 'style-src')).toContain("'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('passes the same nonce and policy to Next.js on the request headers', async () => {
    const res = await page('/login');
    const csp = res.headers.get('content-security-policy');
    const overridden = res.headers.get('x-middleware-override-headers')!.split(',');
    expect(overridden).toEqual(expect.arrayContaining(['x-nonce', 'content-security-policy']));
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonceOf(csp));
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
  });

  it('uses a fresh nonce per request', async () => {
    const a = nonceOf((await page('/login')).headers.get('content-security-policy'));
    const b = nonceOf((await page('/login')).headers.get('content-security-policy'));
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it('CSP_REPORT_ONLY=1 sends the report-only header instead', async () => {
    process.env.CSP_REPORT_ONLY = '1';
    const res = await page('/login');
    expect(res.headers.get('content-security-policy')).toBeNull();
    expect(nonceOf(res.headers.get('content-security-policy-report-only'))).toBeTruthy();
    expect(res.headers.get('x-middleware-request-content-security-policy-report-only')).toBeTruthy();
  });

  it('dashboard redirects and API rejections carry the CSP too', async () => {
    const redirect = await page('/dashboard');
    expect(redirect.status).toBe(307);
    expect(nonceOf(redirect.headers.get('content-security-policy'))).toBeTruthy();

    const rejected = await proxy(
      new NextRequest(new URL('/api/sales', 'https://shop.example.com'), { method: 'POST', headers: { origin: 'https://evil.example' } })
    );
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get('content-security-policy')).toBeTruthy();
  });
});

describe('proxy matcher', () => {
  const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

  it('runs on pages and API routes', () => {
    for (const url of ['/', '/login', '/dashboard', '/dashboard/billing/invoice/abc', '/dashboard/inventory/print', '/api/sales', '/api/export.json']) {
      expect(matches(url), url).toBe(true);
    }
  });

  it('skips build output, the image optimizer, favicon and static files', () => {
    for (const url of ['/_next/static/chunks/main.js', '/_next/static/css/app.css', '/_next/image?url=%2Flogo.png&w=64&q=75', '/favicon.ico', '/logo.png', '/pdf.worker.min.mjs', '/pdfjs-dist/pdf.mjs.map']) {
      expect(matches(url), url).toBe(false);
    }
  });
});
