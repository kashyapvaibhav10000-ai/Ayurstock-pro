/**
 * Finding #11 (Low): database restore accepted any number of rows (each one
 * a sequential query), and login-history took any `limit`. Restore now
 * refuses more than 20,000 medicines + sales; login-history clamps limit to
 * 1..200 (default 50).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { call, makeReq, prisma, resetDb, seedShop, tokenFor, Seed } from '../helpers';
import * as restore from '@/app/api/database/restore/route';
import * as loginHistory from '@/app/api/admin/login-history/route';

let A: Seed;

beforeEach(async () => {
  await resetDb();
  A = await seedShop('A');
});

describe('#11 restore row cap', () => {
  const restoreReq = (data: unknown) =>
    makeReq('/api/database/restore?dryRun=true', { method: 'POST', token: tokenFor(A.admin), body: { meta: { version: '2.0' }, data } });

  it('refuses more than 20,000 medicines + sales', async () => {
    const medicines = Array.from({ length: 15_000 }, (_, i) => ({ name: `M${i}`, company: 'Co' }));
    const sales = Array.from({ length: 5_001 }, (_, i) => ({ invoiceNumber: `X-${i}` }));
    const res = await call(restore.POST, restoreReq({ medicines, sales }));
    expect(res.status).toBe(400);
  });

  it('still accepts a backup at the cap', async () => {
    const medicines = Array.from({ length: 20_000 }, (_, i) => ({ name: `M${i}`, company: 'Co' }));
    const res = await call(restore.POST, restoreReq({ medicines }));
    expect(res.status).toBe(200);
  });
});

describe('#11 login-history limit clamp', () => {
  const history = (limit: string) =>
    call(loginHistory.GET, makeReq(`/api/admin/login-history?limit=${limit}`, { token: tokenFor(A.admin) }));

  it('caps limit at 200', async () => {
    await prisma.loginHistory.createMany({
      data: Array.from({ length: 250 }, () => ({ userId: A.cashier.id, shopId: A.shop.id, status: 'failed', ipAddress: '198.51.100.1' })),
    });
    const res = await history('100000');
    expect(res.status).toBe(200);
    expect(res.json.data.length).toBe(200);
    expect(res.json.pagination.limit).toBe(200);
  });

  it('falls back to 50 for junk and at least 1 for zero/negative', async () => {
    expect((await history('abc')).json.pagination.limit).toBe(50);
    expect((await history('-5')).json.pagination.limit).toBe(1);
  });
});
