/**
 * Session hardening: server-side logout (sid denylist), 12h idle expiry with
 * sliding refresh, 7-day absolute cap.
 */
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { call, makeReq, prisma, resetDb, seedShop, setCookie, tokenFor, PASSWORD, Seed } from './helpers';
import { SESSION_ABSOLUTE_SECONDS, SESSION_IDLE_SECONDS, verifyToken } from '@/lib/auth';
import { proxy } from '@/proxy';
import * as logout from '@/app/api/auth/logout/route';
import * as sales from '@/app/api/sales/route';
import * as profile from '@/app/api/settings/profile/route';
import * as changePassword from '@/app/api/users/change-password/route';

let A: Seed;

beforeEach(async () => {
  await resetDb();
  A = await seedShop('A');
});

const now = () => Math.floor(Date.now() / 1000);
const listSales = (token: string) => call(sales.GET, makeReq('/api/sales', { token }));

/** A token signed like generateToken's, with the given claims overridden. */
function craft(claims: Record<string, unknown>, expiresIn: number = SESSION_IDLE_SECONDS) {
  const base = { userId: A.admin.id, shopId: A.shop.id, email: A.admin.email, role: 'ADMIN', tv: 0, sid: crypto.randomUUID(), sst: now() };
  return jwt.sign({ ...base, ...claims }, process.env.JWT_SECRET!, { algorithm: 'HS256', expiresIn });
}

function proxyReq(path: string, token: string, headers: Record<string, string> = {}, method = 'GET') {
  return new NextRequest(new URL(path, 'https://shop.example.com'), {
    method,
    headers: { cookie: `auth-token=${token}`, ...headers },
  });
}

describe('server-side logout', () => {
  it('generateToken adds a session id and start', () => {
    const payload = verifyToken(tokenFor(A.admin))!;
    expect(payload.sid).toMatch(/^[0-9a-f-]{36}$/);
    expect(Math.abs(payload.sst! - now())).toBeLessThanOrEqual(2);
    expect(payload.exp - payload.iat).toBe(SESSION_IDLE_SECONDS);
  });

  it('a logged-out token is refused everywhere', async () => {
    const token = tokenFor(A.admin);
    expect((await listSales(token)).status).toBe(200);

    const out = await call(logout.POST, makeReq('/api/auth/logout', { method: 'POST', token }));
    expect(out.status).toBe(200);
    expect(setCookie(out.res, 'auth-token')).toBe('');

    expect((await listSales(token)).status).toBe(401);
    const row = await prisma.revokedSession.findUnique({ where: { sid: verifyToken(token)!.sid! } });
    expect(row?.userId).toBe(A.admin.id);

    // Other sessions of the same user are unaffected.
    expect((await listSales(tokenFor(A.admin))).status).toBe(200);
  });

  it('logout without a valid cookie still clears it and returns 200', async () => {
    const out = await call(logout.POST, makeReq('/api/auth/logout', { method: 'POST', token: 'garbage' }));
    expect(out.status).toBe(200);
    expect(setCookie(out.res, 'auth-token')).toBe('');
  });

  it('refuses sessions past the 7-day absolute cap', async () => {
    const token = craft({ sst: now() - SESSION_ABSOLUTE_SECONDS - 60 });
    expect((await listSales(token)).status).toBe(401);
  });

  it('refuses tokens without a session id or start', async () => {
    expect((await listSales(craft({ sid: undefined }))).status).toBe(401);
    expect((await listSales(craft({ sst: undefined }))).status).toBe(401);
  });
});

describe('token reissue revokes the old session', () => {
  const isRevoked = async (token: string) =>
    Boolean(await prisma.revokedSession.findUnique({ where: { sid: verifyToken(token)!.sid! } }));

  it('profile update with a new password: old cookie 401, new cookie 200', async () => {
    const old = tokenFor(A.admin);
    const res = await call(
      profile.PUT,
      makeReq('/api/settings/profile', {
        method: 'PUT',
        token: old,
        body: { name: 'Renamed', email: 'renamed-admin@test.dev', username: 'renamed_admin', password: 'NewPassword456!', currentPassword: PASSWORD },
      })
    );
    expect(res.status).toBe(200);
    const fresh = setCookie(res.res, 'auth-token')!;
    expect(fresh).toBeTruthy();
    expect(verifyToken(fresh)!.sid).not.toBe(verifyToken(old)!.sid);

    expect(await isRevoked(old)).toBe(true);
    expect((await listSales(old)).status).toBe(401);
    expect((await listSales(fresh)).status).toBe(200);
  });

  it('profile update without a password change issues no new cookie and keeps the session', async () => {
    const current = tokenFor(A.admin);
    const res = await call(
      profile.PUT,
      makeReq('/api/settings/profile', {
        method: 'PUT',
        token: current,
        body: { name: 'Renamed', email: 'renamed-admin@test.dev', username: 'renamed_admin', currentPassword: PASSWORD },
      })
    );
    expect(res.status).toBe(200);
    expect(setCookie(res.res, 'auth-token')).toBeNull();
    expect((await listSales(current)).status).toBe(200);
  });

  it('change-password on yourself: old cookie 401, new cookie 200', async () => {
    const old = tokenFor(A.admin);
    const res = await call(
      changePassword.POST,
      makeReq('/api/users/change-password', {
        method: 'POST',
        token: old,
        body: { userId: A.admin.id, currentPassword: PASSWORD, newPassword: 'NewPassword456!' },
      })
    );
    expect(res.status).toBe(200);
    const fresh = setCookie(res.res, 'auth-token')!;
    expect(fresh).toBeTruthy();

    expect(await isRevoked(old)).toBe(true);
    expect((await listSales(old)).status).toBe(401);
    expect((await listSales(fresh)).status).toBe(200);
  });
});

describe('sliding refresh in the proxy', () => {
  const issuedAgo = (seconds: number, claims: Record<string, unknown> = {}) =>
    craft({ iat: now() - seconds, ...claims });

  it('re-signs an API session older than 10 minutes, keeping sid and sst', async () => {
    const token = issuedAgo(3600);
    const res = await proxy(proxyReq('/api/sales', token));
    expect(res.headers.get('x-middleware-next')).toBe('1');
    const fresh = setCookie(res, 'auth-token');
    expect(fresh).toBeTruthy();

    const before = verifyToken(token)!;
    const after = verifyToken(fresh!)!;
    expect(after.sid).toBe(before.sid);
    expect(after.sst).toBe(before.sst);
    expect(Math.abs(after.exp - (now() + SESSION_IDLE_SECONDS))).toBeLessThanOrEqual(2);
  });

  it('re-signs dashboard sessions too', async () => {
    const res = await proxy(proxyReq('/dashboard', issuedAgo(3600)));
    expect(setCookie(res, 'auth-token')).toBeTruthy();
  });

  it('does not re-sign a token issued in the last 10 minutes', async () => {
    const res = await proxy(proxyReq('/api/sales', issuedAgo(60)));
    expect(setCookie(res, 'auth-token')).toBeNull();
  });

  it('never extends past the absolute cap', async () => {
    const sst = now() - SESSION_ABSOLUTE_SECONDS + 3600;
    const res = await proxy(proxyReq('/api/sales', issuedAgo(3600, { sst })));
    const after = verifyToken(setCookie(res, 'auth-token')!)!;
    expect(after.exp).toBe(sst + SESSION_ABSOLUTE_SECONDS);
  });

  it('never extends POS sessions or legacy tokens without sid', async () => {
    expect(setCookie(await proxy(proxyReq('/api/sales', issuedAgo(3600, { pos: true }))), 'auth-token')).toBeNull();
    expect(setCookie(await proxy(proxyReq('/api/sales', issuedAgo(3600, { sid: undefined }))), 'auth-token')).toBeNull();
  });

  it('does not refresh on rejected API requests, and passes bad API tokens through', async () => {
    const rejected = await proxy(proxyReq('/api/sales', issuedAgo(3600), { origin: 'https://evil.example' }, 'POST'));
    expect(rejected.status).toBe(403);
    expect(setCookie(rejected, 'auth-token')).toBeNull();

    const bad = await proxy(proxyReq('/api/sales', 'garbage'));
    expect(bad.headers.get('x-middleware-next')).toBe('1');
    expect(setCookie(bad, 'auth-token')).toBeNull();
  });
});
