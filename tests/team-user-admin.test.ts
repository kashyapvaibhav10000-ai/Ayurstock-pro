/**
 * Team page admin actions: force logout of a team member, and permanent
 * delete (account wiped, history kept, cannot be reactivated).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { call, makeReq, PASSWORD, prisma, resetDb, seedShop, tokenFor, Seed } from './helpers';
import * as userById from '@/app/api/users/[id]/route';
import * as users from '@/app/api/users/route';
import * as forceLogout from '@/app/api/users/[id]/logout/route';
import * as session from '@/app/api/auth/session/route';

let A: Seed;
let B: Seed;

beforeEach(async () => {
  await resetDb();
  A = await seedShop('A');
  B = await seedShop('B');
});

const sessionStatus = async (user: Seed['admin']) =>
  (await call(session.GET, makeReq('/api/auth/session', { token: tokenFor(user) }))).status;

const logout = (by: Seed['admin'], target: { id: string }) =>
  call(forceLogout.POST, makeReq(`/api/users/${target.id}/logout`, { method: 'POST', token: tokenFor(by) }), { id: target.id });

const deletePermanently = (target: { id: string }, password?: string) =>
  call(
    userById.DELETE,
    makeReq(`/api/users/${target.id}?permanent=1`, { method: 'DELETE', token: tokenFor(A.admin), body: password === undefined ? {} : { password } }),
    { id: target.id }
  );

describe('admin force logout', () => {
  it('ends the user\'s sessions; the account stays active', async () => {
    expect(await sessionStatus(A.cashier)).toBe(200);
    const res = await logout(A.admin, A.cashier);
    expect(res.status).toBe(200);
    expect(await sessionStatus(A.cashier)).toBe(401);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: A.cashier.id } });
    expect(after.isActive).toBe(true);
    // A fresh login (new token with the new version) works again.
    expect((await call(session.GET, makeReq('/api/auth/session', { token: tokenFor(after) }))).status).toBe(200);
    expect(await prisma.activityLog.count({ where: { shopId: A.shop.id, action: 'FORCE_LOGOUT_USER' } })).toBe(1);
  });

  it('admins only, never self, never another admin, never another shop', async () => {
    expect((await logout(A.manager, A.cashier)).status).toBe(403);
    expect((await logout(A.admin, A.admin)).status).toBe(400);
    const otherAdmin = await prisma.user.create({
      data: { shopId: A.shop.id, name: 'Admin 2', email: 'a2@test.dev', passwordHash: 'x', role: 'ADMIN', isActive: true },
    });
    expect((await logout(A.admin, otherAdmin)).status).toBe(403);
    expect((await logout(A.admin, B.cashier)).status).toBe(404);
    expect(await sessionStatus(B.cashier)).toBe(200);
  });
});

describe('admin permanent delete', () => {
  it('needs the admin\'s password', async () => {
    expect((await deletePermanently(A.cashier)).status).toBe(403);
    expect((await deletePermanently(A.cashier, 'wrong-password')).status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: A.cashier.id } })).deletedAt).toBeNull();
  });

  it('wipes the account, keeps history, frees the email, and cannot be undone', async () => {
    const email = A.cashier.email;
    // A bill this cashier made must survive the delete.
    await prisma.sale.update({ where: { id: A.sale.id }, data: { createdByUserId: A.cashier.id } });

    const res = await deletePermanently(A.cashier, PASSWORD);
    expect(res.status).toBe(200);

    const wiped = await prisma.user.findUniqueOrThrow({ where: { id: A.cashier.id } });
    expect(wiped).toMatchObject({ isActive: false, username: null, phone: null, pinHash: null });
    expect(wiped.deletedAt).not.toBeNull();
    expect(wiped.email).toBe(`deleted-${A.cashier.id}@deleted.invalid`);
    expect(wiped.name).toMatch(/^Deleted user \(/);
    // Sessions are dead, history still points at the row.
    expect(await sessionStatus(A.cashier)).toBe(401);
    const bill = await prisma.sale.findUniqueOrThrow({ where: { id: A.sale.id }, include: { createdByUser: true } });
    expect(bill.createdByUser.name).toMatch(/^Deleted user \(/);

    // Gone from the team list; cannot be reactivated or deleted again.
    const list = await call(users.GET, makeReq('/api/users', { token: tokenFor(A.admin) }));
    expect(list.json.users.some((u: { id: string }) => u.id === A.cashier.id)).toBe(false);
    const reactivate = await call(
      userById.PUT,
      makeReq(`/api/users/${A.cashier.id}`, { method: 'PUT', token: tokenFor(A.admin), body: { isActive: true } }),
      { id: A.cashier.id }
    );
    expect(reactivate.status).toBe(404);
    expect((await deletePermanently(A.cashier, PASSWORD)).status).toBe(404);

    // The old email can be used for a new account.
    const created = await call(
      users.POST,
      makeReq('/api/users', { method: 'POST', token: tokenFor(A.admin), body: { name: 'New', email, password: 'Another123!', role: 'CASHIER' } })
    );
    expect(created.json.success).toBe(true);
  });

  it('cannot permanently delete an admin or self', async () => {
    const res = await call(
      userById.DELETE,
      makeReq(`/api/users/${A.admin.id}?permanent=1`, { method: 'DELETE', token: tokenFor(A.admin), body: { password: PASSWORD } }),
      { id: A.admin.id }
    );
    expect(res.status).toBe(400);
  });
});
