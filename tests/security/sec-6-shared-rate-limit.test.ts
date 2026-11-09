/**
 * Finding #6 (Medium): the rate limiter lived in one process's memory, so a
 * new serverless instance started with empty buckets, and without a trusted
 * proxy every caller shared the 'unknown' bucket. The per-account login limit
 * also counted successful logins. Now: buckets are in Postgres, Vercel's own
 * client-IP header is read when TRUST_PROXY is unset, and the per-account
 * login bucket counts failures only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { call, makeReq, resetDb, seedShop, PASSWORD, Seed } from '../helpers';
import * as login from '@/app/api/auth/login/route';

let A: Seed;

beforeEach(async () => {
  await resetDb();
  A = await seedShop('A');
});

afterEach(() => {
  process.env.TRUST_PROXY = 'cloudflare';
  delete process.env.VERCEL;
});

describe('#6 buckets are shared, not per process', () => {
  it('a fresh module instance (new lambda) still sees the earlier hits', async () => {
    const first = await import('@/lib/rate-limit');
    for (let i = 0; i < 3; i++) await first.rateLimit('shared-test', 3, 60_000);
    expect((await first.rateLimit('shared-test', 3, 60_000)).allowed).toBe(false);

    vi.resetModules();
    const fresh = await import('@/lib/rate-limit');
    expect(fresh).not.toBe(first);
    expect((await fresh.rateLimit('shared-test', 3, 60_000)).allowed).toBe(false);
  });
});

describe('#6 client IP on Vercel', () => {
  it('reads x-vercel-forwarded-for when TRUST_PROXY is unset and VERCEL=1', async () => {
    const { getClientIp } = await import('@/lib/rate-limit');
    delete process.env.TRUST_PROXY;
    process.env.VERCEL = '1';
    const req = new Request('http://localhost/api/auth/login', { headers: { 'x-vercel-forwarded-for': '198.51.100.23' } });
    expect(getClientIp(req)).toBe('198.51.100.23');
  });

  it('ignores a spoofed x-forwarded-for and garbage in the Vercel header', async () => {
    const { getClientIp } = await import('@/lib/rate-limit');
    delete process.env.TRUST_PROXY;
    process.env.VERCEL = '1';
    expect(getClientIp(new Request('http://x/', { headers: { 'x-forwarded-for': '1.2.3.4' } }))).toBe('unknown');
    expect(getClientIp(new Request('http://x/', { headers: { 'x-vercel-forwarded-for': '<script>' } }))).toBe('unknown');
  });
});

describe('#6 per-account login limit counts failures only', () => {
  const attempt = (password: string, i: number) =>
    call(login.POST, makeReq('/api/auth/login', { method: 'POST', body: { identifier: A.admin.email, password }, ip: `198.51.100.${(i % 200) + 1}` }));

  it('25 successful logins for one account are never throttled', async () => {
    for (let i = 0; i < 25; i++) {
      expect((await attempt(PASSWORD, i)).status, `login ${i + 1}`).toBe(200);
    }
  });

  it('20 failures lock the account, even for the right password', async () => {
    for (let i = 0; i < 20; i++) expect((await attempt('wrong-password', i)).status).toBe(401);
    expect((await attempt(PASSWORD, 99)).status).toBe(429);
  });
});
