/**
 * Finding #1 (High): clear-all and by-company wiped data with a bare ADMIN
 * session; the password re-check lived only in the browser. The API must now
 * verify the admin's password itself and log the wipe.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { call, makeReq, prisma, resetDb, seedShop, tokenFor, PASSWORD, Seed } from '../helpers';
import * as clearAll from '@/app/api/medicines/clear-all/route';
import * as byCompany from '@/app/api/medicines/by-company/route';

let A: Seed;

beforeEach(async () => {
  await resetDb();
  A = await seedShop('A');
});

const del = (path: string, body: unknown) =>
  makeReq(path, { method: 'DELETE', token: tokenFor(A.admin), body });

describe('#1 clear-all requires the admin password', () => {
  it('refuses with no password and deletes nothing', async () => {
    const res = await call(clearAll.DELETE, makeReq('/api/medicines/clear-all', { method: 'DELETE', token: tokenFor(A.admin) }));
    expect(res.status).toBe(403);
    expect(await prisma.medicine.count({ where: { shopId: A.shop.id } })).toBe(1);
    expect(await prisma.saleItem.count({ where: { saleId: A.sale.id } })).toBe(1);
  });

  it('refuses a wrong password and deletes nothing', async () => {
    const res = await call(clearAll.DELETE, del('/api/medicines/clear-all', { password: 'wrong-password' }));
    expect(res.status).toBe(403);
    expect(await prisma.medicine.count({ where: { shopId: A.shop.id } })).toBe(1);
  });

  it('wipes with the right password and writes an activity log row', async () => {
    const res = await call(clearAll.DELETE, del('/api/medicines/clear-all', { password: PASSWORD }));
    expect(res.status).toBe(200);
    expect(await prisma.medicine.count({ where: { shopId: A.shop.id } })).toBe(0);
    expect(await prisma.activityLog.count({ where: { shopId: A.shop.id, action: 'CLEAR_ALL_MEDICINES', userId: A.admin.id } })).toBe(1);
  });
});

describe('#1 by-company requires the admin password', () => {
  it('refuses with no password and deletes nothing', async () => {
    const res = await call(byCompany.DELETE, del('/api/medicines/by-company', { companyName: 'Co' }));
    expect(res.status).toBe(403);
    expect(await prisma.medicine.count({ where: { shopId: A.shop.id } })).toBe(1);
  });

  it('refuses a wrong password and deletes nothing', async () => {
    const res = await call(byCompany.DELETE, del('/api/medicines/by-company', { companyName: 'Co', password: 'nope-nope' }));
    expect(res.status).toBe(403);
    expect(await prisma.medicine.count({ where: { shopId: A.shop.id } })).toBe(1);
  });

  it('deletes with the right password and writes an activity log row', async () => {
    const res = await call(byCompany.DELETE, del('/api/medicines/by-company', { companyName: 'Co', password: PASSWORD }));
    expect(res.status).toBe(200);
    expect(await prisma.medicine.count({ where: { shopId: A.shop.id } })).toBe(0);
    expect(await prisma.activityLog.count({ where: { shopId: A.shop.id, action: 'CLEAR_BY_COMPANY' } })).toBe(1);
  });
});
