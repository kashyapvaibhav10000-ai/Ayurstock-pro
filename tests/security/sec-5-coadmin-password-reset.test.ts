/**
 * Finding #5 (Medium): an ADMIN could reset a co-ADMIN's password through
 * /api/users/change-password and take over that account. Editing or deleting
 * another admin is already refused; resetting their password must be too.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { call, makeReq, prisma, resetDb, seedShop, tokenFor, Seed } from '../helpers';
import * as changePassword from '@/app/api/users/change-password/route';

let A: Seed;

beforeEach(async () => {
  await resetDb();
  A = await seedShop('A');
});

describe('#5 change-password: another admin is off limits', () => {
  it('refuses to reset a co-admin password and leaves the hash unchanged', async () => {
    const coAdmin = await prisma.user.create({
      data: { shopId: A.shop.id, name: 'Co Admin', email: 'coadmin@test.dev', passwordHash: A.admin.passwordHash, role: 'ADMIN', isActive: true },
    });
    const res = await call(
      changePassword.POST,
      makeReq('/api/users/change-password', { method: 'POST', token: tokenFor(A.admin), body: { userId: coAdmin.id, newPassword: 'taken-over-123' } })
    );
    expect(res.status).toBe(403);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: coAdmin.id } });
    expect(after.passwordHash).toBe(coAdmin.passwordHash);
    expect(after.tokenVersion).toBe(coAdmin.tokenVersion);
  });

  it('still lets an admin reset a cashier password', async () => {
    const res = await call(
      changePassword.POST,
      makeReq('/api/users/change-password', { method: 'POST', token: tokenFor(A.admin), body: { userId: A.cashier.id, newPassword: 'NewPassword9' } })
    );
    expect(res.status).toBe(200);
  });
});
