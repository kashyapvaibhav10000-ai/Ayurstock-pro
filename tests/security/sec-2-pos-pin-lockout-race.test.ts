/**
 * Finding #2 (Medium): the PIN lockout read lockedUntil, checked the PIN and
 * only then counted the failure, so a burst of parallel guesses all got
 * evaluated before the lock was written. An attempt must now be reserved
 * atomically first. PIN login must also never hand out an ADMIN session.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { call, makeReq, prisma, resetDb, seedShop, setCookie, tokenFor, Seed } from '../helpers';
import * as posDevices from '@/app/api/pos-devices/route';
import * as posDevice from '@/app/api/auth/pos-device/route';
import * as posLogin from '@/app/api/auth/pos-login/route';
import * as teamMember from '@/app/api/users/[id]/route';

let A: Seed;

beforeEach(async () => {
  await resetDb();
  A = await seedShop('A');
});

async function pairDevice(seed: Seed) {
  const created = await call(posDevices.POST, makeReq('/api/pos-devices', { method: 'POST', token: tokenFor(seed.admin), body: { name: 'Till' } }));
  const redeemed = await call(posDevice.POST, makeReq('/api/auth/pos-device', { method: 'POST', body: { code: created.json.data.code } }));
  return setCookie(redeemed.res, 'pos-device')!;
}

async function setPin(userId: string, pin: string) {
  const res = await call(teamMember.PUT, makeReq(`/api/users/${userId}`, { method: 'PUT', token: tokenFor(A.admin), body: { pin } }), { id: userId });
  expect(res.status).toBe(200);
}

const pinLogin = (device: string, pin: string, ip: string) =>
  call(posLogin.POST, makeReq('/api/auth/pos-login', { method: 'POST', body: { pin }, ip, cookies: { 'pos-device': device } }));

describe('#2 PIN lockout cannot be raced', () => {
  it('a parallel burst of wrong PINs gets at most 5 guesses evaluated', async () => {
    await setPin(A.cashier.id, '1111');
    const device = await pairDevice(A);
    // Distinct IPs so only the device lock, not the per-IP limit, is in play.
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => pinLogin(device, String(2000 + i), `198.51.100.${i + 10}`))
    );
    const evaluated = results.filter((r) => r.status === 401).length;
    expect(evaluated).toBeLessThanOrEqual(5);
    expect(results.filter((r) => r.status === 429).length).toBeGreaterThanOrEqual(15);
    const row = await prisma.posDevice.findFirstOrThrow({ where: { shopId: A.shop.id } });
    expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('a correct PIN resets the failure count', async () => {
    await setPin(A.cashier.id, '1111');
    const device = await pairDevice(A);
    await pinLogin(device, '9998', '198.51.100.50');
    await pinLogin(device, '9997', '198.51.100.51');
    expect((await pinLogin(device, '1111', '198.51.100.52')).status).toBe(200);
    const row = await prisma.posDevice.findFirstOrThrow({ where: { shopId: A.shop.id } });
    expect(row.failedPinCount).toBe(0);
  });
});

describe('#2 PIN login never issues an ADMIN session', () => {
  it('refuses the admin PIN and sets no auth cookie', async () => {
    await setPin(A.admin.id, '4242');
    const device = await pairDevice(A);
    const res = await pinLogin(device, '4242', '198.51.100.60');
    expect(res.status).toBe(403);
    expect(setCookie(res.res, 'auth-token')).toBeNull();
  });
});
