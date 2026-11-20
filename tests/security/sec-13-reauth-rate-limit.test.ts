/**
 * Finding #13 (Medium, external audit 2026-11-19): the password re-checks in
 * front of destructive actions (clear-all, by-company, permanent user delete)
 * and login-detail changes (change-password, profile, team self-edit) had no
 * rate limit, so a stolen session could guess the real password at bcrypt
 * speed. Now every re-check shares one per-user bucket with verify-password:
 * 5 wrong passwords per 15 minutes, counted before bcrypt, correct ones free.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { call, makeReq, prisma, resetDb, seedShop, tokenFor, PASSWORD, Seed } from '../helpers';
import * as clearAll from '@/app/api/medicines/clear-all/route';
import * as byCompany from '@/app/api/medicines/by-company/route';
import * as userById from '@/app/api/users/[id]/route';
import * as changePassword from '@/app/api/users/change-password/route';
import * as profile from '@/app/api/settings/profile/route';
import * as verifyPassword from '@/app/api/auth/verify-password/route';

let A: Seed;

beforeEach(async () => {
  await resetDb();
  A = await seedShop('A');
});

const as = (user: Seed['admin']) => tokenFor(user);

const routes = {
  clearAll: (password: string) =>
    call(clearAll.DELETE, makeReq('/api/medicines/clear-all', { method: 'DELETE', token: as(A.admin), body: { password } })),
  byCompany: (password: string) =>
    call(byCompany.DELETE, makeReq('/api/medicines/by-company', { method: 'DELETE', token: as(A.admin), body: { companyName: 'Co', password } })),
  permanentDelete: (password: string) =>
    call(
      userById.DELETE,
      makeReq(`/api/users/${A.cashier.id}?permanent=1`, { method: 'DELETE', token: as(A.admin), body: { password } }),
      { id: A.cashier.id }
    ),
  changePassword: (password: string) =>
    call(
      changePassword.POST,
      makeReq('/api/users/change-password', {
        method: 'POST',
        token: as(A.admin),
        body: { userId: A.admin.id, currentPassword: password, newPassword: 'brand-new-password' },
      })
    ),
  profile: (password: string) =>
    call(
      profile.PUT,
      makeReq('/api/settings/profile', {
        method: 'PUT',
        token: as(A.admin),
        body: { name: 'Admin', email: A.admin.email, password: 'brand-new-password', currentPassword: password },
      })
    ),
  teamSelfEdit: (password: string) =>
    call(
      userById.PUT,
      makeReq(`/api/users/${A.admin.id}`, { method: 'PUT', token: as(A.admin), body: { email: 'new-admin@test.dev', currentPassword: password } }),
      { id: A.admin.id }
    ),
};

describe('#13 every password re-check is rate limited per user', () => {
  for (const [name, run] of Object.entries(routes)) {
    it(`${name}: 6th try in the window gets 429, even with the right password`, async () => {
      for (let i = 0; i < 5; i++) expect((await run(`guess-${i}`)).status, `guess ${i + 1}`).not.toBe(429);
      expect((await run(PASSWORD)).status).toBe(429);
    });
  }

  it('the bucket is shared across routes, so spreading guesses does not help', async () => {
    await routes.clearAll('g1');
    await routes.byCompany('g2');
    await routes.permanentDelete('g3');
    await routes.changePassword('g4');
    await routes.profile('g5');
    expect((await routes.clearAll(PASSWORD)).status).toBe(429);
    // Nothing was wiped.
    expect(await prisma.medicine.count({ where: { shopId: A.shop.id } })).toBe(1);
    // verify-password shares the bucket too.
    const verify = await call(
      verifyPassword.POST,
      makeReq('/api/auth/verify-password', { method: 'POST', token: as(A.admin), body: { password: PASSWORD } })
    );
    expect(verify.status).toBe(429);
  });

  it('a parallel burst cannot get more than 5 guesses through', async () => {
    const results = await Promise.all(Array.from({ length: 15 }, (_, i) => routes.clearAll(`guess-${i}`)));
    expect(results.filter((r) => r.status === 403).length).toBe(5);
    expect(results.filter((r) => r.status === 429).length).toBe(10);
  });

  it('correct passwords do not use up the limit', async () => {
    for (let i = 0; i < 8; i++) {
      const v = await call(
        verifyPassword.POST,
        makeReq('/api/auth/verify-password', { method: 'POST', token: as(A.admin), body: { password: PASSWORD } })
      );
      expect(v.status).toBe(200);
      expect(v.json.success).toBe(true);
    }
    expect((await routes.clearAll(PASSWORD)).status).toBe(200);
  });

  it('a missing password is refused without counting', async () => {
    for (let i = 0; i < 8; i++) expect((await routes.clearAll('')).status).toBe(403);
    expect((await routes.clearAll(PASSWORD)).status).toBe(200);
  });

  it('the limit is per user', async () => {
    for (let i = 0; i < 6; i++) await routes.clearAll(`guess-${i}`);
    const other = await call(
      verifyPassword.POST,
      makeReq('/api/auth/verify-password', { method: 'POST', token: as(A.manager), body: { password: PASSWORD } })
    );
    expect(other.status).toBe(200);
    expect(other.json.success).toBe(true);
  });
});
