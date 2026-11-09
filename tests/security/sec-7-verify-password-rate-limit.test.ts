/**
 * Finding #7 (Low): /api/auth/verify-password had no limit, so anyone with a
 * session could guess that user's password at full speed, around the login
 * limiter. Now 5 checks per user per 15 minutes.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { call, makeReq, resetDb, seedShop, tokenFor, PASSWORD, Seed } from '../helpers';
import * as verifyPassword from '@/app/api/auth/verify-password/route';

let A: Seed;

beforeEach(async () => {
  await resetDb();
  A = await seedShop('A');
});

const check = (password: string) =>
  call(verifyPassword.POST, makeReq('/api/auth/verify-password', { method: 'POST', token: tokenFor(A.admin), body: { password } }));

describe('#7 verify-password is rate limited per user', () => {
  it('the 6th guess within the window is refused with 429, even if correct', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await check(`guess-${i}`);
      expect(res.status).toBe(200);
      expect(res.json.success).toBe(false);
    }
    expect((await check(PASSWORD)).status).toBe(429);
  });

  it('the limit is per user: another user is unaffected', async () => {
    for (let i = 0; i < 6; i++) await check(`guess-${i}`);
    const other = await call(
      verifyPassword.POST,
      makeReq('/api/auth/verify-password', { method: 'POST', token: tokenFor(A.manager), body: { password: PASSWORD } })
    );
    expect(other.status).toBe(200);
    expect(other.json.success).toBe(true);
  });
});
