/**
 * Security audit, phase 2: one block per Critical/High finding. Each test
 * replays the exploit and asserts it now fails.
 */
import { execSync } from 'child_process';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it } from 'vitest';
import { call, makeReq, prisma, resetDb, seedShop, setCookie, tokenFor, PASSWORD, Seed } from './helpers';
import { hashPin, sha256 } from '@/lib/pin';
import { getClientIp, resetRateLimits } from '@/lib/rate-limit';
import { isSuperAdmin } from '@/lib/super-admin';
import * as aiUsage from '@/app/api/admin/ai-usage/route';
import * as aiKeys from '@/app/api/admin/ai-keys/route';
import * as profile from '@/app/api/settings/profile/route';
import * as team from '@/app/api/users/route';
import * as teamMember from '@/app/api/users/[id]/route';
import * as changePassword from '@/app/api/users/change-password/route';
import * as posLogin from '@/app/api/auth/pos-login/route';
import * as posDevice from '@/app/api/auth/pos-device/route';
import * as posDevices from '@/app/api/pos-devices/route';
import * as posDeviceItem from '@/app/api/pos-devices/[id]/route';
import * as login from '@/app/api/auth/login/route';
import * as sales from '@/app/api/sales/route';
import * as saleDetail from '@/app/api/sales/[id]/route';
import * as restore from '@/app/api/database/restore/route';
import * as returns from '@/app/api/returns/route';
import * as medicineImport from '@/app/api/medicines/import/route';
import * as priceListImport from '@/app/api/medicine/import-price-list/route';
import * as billingSettings from '@/app/api/settings/billing/route';

let A: Seed;
let B: Seed;

beforeEach(async () => {
  await resetDb();
  delete process.env.SUPER_ADMIN_USER_IDS;
  delete process.env.SUPER_ADMIN_EMAILS;
  delete process.env.SUPER_ADMIN_USERNAMES;
  A = await seedShop('A');
  B = await seedShop('B');
});

/** Pair a device for `seed`'s shop and return its cookie value. */
async function pairDevice(seed: Seed, name = 'Counter 1') {
  const created = await call(posDevices.POST, makeReq('/api/pos-devices', { method: 'POST', token: tokenFor(seed.admin), body: { name } }));
  expect(created.status).toBe(201);
  const redeemed = await call(posDevice.POST, makeReq('/api/auth/pos-device', { method: 'POST', body: { code: created.json.data.code } }));
  expect(redeemed.status).toBe(200);
  return setCookie(redeemed.res, 'pos-device')!;
}

async function setPin(seed: Seed, userId: string, pin: string) {
  const res = await call(
    teamMember.PUT,
    makeReq(`/api/users/${userId}`, { method: 'PUT', token: tokenFor(seed.admin), body: { pin } }),
    { id: userId }
  );
  expect(res.status).toBe(200);
}

const pinLogin = (device: string | null, pin: string, ip = '198.51.100.7', headers: Record<string, string> = {}) =>
  call(posLogin.POST, makeReq('/api/auth/pos-login', { method: 'POST', body: { pin }, ip, headers, cookies: device ? { 'pos-device': device } : {} }));

describe('#1 Critical — super-admin escalation by copying the super-admin email', () => {
  it('another shop admin cannot take the super-admin email, and email never grants super-admin', async () => {
    process.env.SUPER_ADMIN_USER_IDS = A.admin.id;
    process.env.SUPER_ADMIN_EMAILS = A.admin.email; // legacy variable must be ignored

    const hijack = await call(
      profile.PUT,
      makeReq('/api/settings/profile', {
        method: 'PUT',
        token: tokenFor(B.admin),
        body: { name: 'Evil', email: A.admin.email, currentPassword: PASSWORD },
      })
    );
    expect(hijack.status).toBe(400);
    expect((await prisma.user.findUnique({ where: { id: B.admin.id } }))!.email).toBe(B.admin.email);

    // Even a user who somehow had the same email is not a super-admin.
    expect(isSuperAdmin({ id: B.admin.id, role: 'ADMIN' })).toBe(false);
    expect((await call(aiUsage.GET, makeReq('/api/admin/ai-usage', { token: tokenFor(B.admin) }))).status).toBe(404);
    expect((await call(aiKeys.GET, makeReq('/api/admin/ai-keys', { token: tokenFor(B.admin) }))).status).toBe(404);
    expect((await call(aiUsage.GET, makeReq('/api/admin/ai-usage', { token: tokenFor(A.admin) }))).status).toBe(200);
  });

  it('a listed id only counts for an active ADMIN', async () => {
    process.env.SUPER_ADMIN_USER_IDS = `${A.manager.id},${A.cashier.id}`;
    expect((await call(aiUsage.GET, makeReq('/api/admin/ai-usage', { token: tokenFor(A.manager) }))).status).toBe(404);
    expect((await call(aiUsage.GET, makeReq('/api/admin/ai-usage', { token: tokenFor(A.cashier) }))).status).toBe(404);
  });

  it('the team form cannot create a second user with an existing email in another shop', async () => {
    const res = await call(
      team.POST,
      makeReq('/api/users', {
        method: 'POST',
        token: tokenFor(B.admin),
        body: { name: 'Copy', email: A.admin.email.toUpperCase(), password: 'longpassword', role: 'CASHIER' },
      })
    );
    expect(res.status).toBe(400);
  });

  it('the database rejects duplicate emails across shops', async () => {
    await expect(
      prisma.user.create({ data: { shopId: B.shop.id, name: 'x', email: A.admin.email, passwordHash: 'x', role: 'CASHIER' } })
    ).rejects.toThrow();
  });
});

describe('#2 Critical — POS PIN brute force across all shops', () => {
  it('PIN login needs a paired device', async () => {
    await setPin(A, A.cashier.id, '1234');
    const res = await pinLogin(null, '1234');
    expect(res.status).toBe(401);
    expect(res.json.code).toBe('DEVICE_NOT_PAIRED');
  });

  it("a device only logs into its own shop's users; other shops' PINs fail with the plain 401", async () => {
    await setPin(A, A.cashier.id, '1111');
    await setPin(B, B.cashier.id, '2222');
    const deviceA = await pairDevice(A);

    const crossShop = await pinLogin(deviceA, '2222');
    expect(crossShop.status).toBe(401);
    expect(crossShop.json.error).toBe('Invalid PIN');

    const ok = await pinLogin(deviceA, '1111');
    expect(ok.status).toBe(200);
    expect(ok.json.data.user.id).toBe(A.cashier.id);
    expect(ok.json.data.user.shopId).toBe(A.shop.id);
  });

  it('the same PIN in two shops is no longer ambiguous: each device finds its own user', async () => {
    await setPin(A, A.cashier.id, '4321');
    await setPin(B, B.cashier.id, '4321');
    const a = await pinLogin(await pairDevice(A), '4321', '198.51.100.1');
    const b = await pinLogin(await pairDevice(B), '4321', '198.51.100.2');
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.json.data.user.id).toBe(A.cashier.id);
    expect(b.json.data.user.id).toBe(B.cashier.id);
  });

  it('locks the device after 5 wrong PINs, even for the right PIN, and stores the lock', async () => {
    await setPin(A, A.cashier.id, '1111');
    const device = await pairDevice(A);
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      resetRateLimits(); // isolate the device lock from the per-IP limit
      statuses.push((await pinLogin(device, String(5000 + i))).status);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 429]);
    resetRateLimits();
    expect((await pinLogin(device, '1111')).status).toBe(429);
    const row = await prisma.posDevice.findFirstOrThrow({ where: { shopId: A.shop.id } });
    expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('a spoofed X-Forwarded-For does not reset the per-IP limit', async () => {
    const device = await pairDevice(A);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      await prisma.posDevice.updateMany({ data: { failedPinCount: 0, lockedUntil: null } });
      statuses.push((await pinLogin(device, '0000', '198.51.100.9', { 'x-forwarded-for': `10.0.0.${i}` })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('pairing codes are single use, expire, and only admins create them', async () => {
    const created = await call(posDevices.POST, makeReq('/api/pos-devices', { method: 'POST', token: tokenFor(A.admin), body: { name: 'Till' } }));
    const code = created.json.data.code as string;
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
    expect(await prisma.posPairingCode.count({ where: { codeHash: code } })).toBe(0); // only the hash is stored

    const first = await call(posDevice.POST, makeReq('/api/auth/pos-device', { method: 'POST', body: { code }, ip: '198.51.100.20' }));
    const second = await call(posDevice.POST, makeReq('/api/auth/pos-device', { method: 'POST', body: { code }, ip: '198.51.100.21' }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(400);

    const stale = await call(posDevices.POST, makeReq('/api/pos-devices', { method: 'POST', token: tokenFor(A.admin), body: { name: 'Old' } }));
    await prisma.posPairingCode.updateMany({ where: { deviceName: 'Old' }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await call(posDevice.POST, makeReq('/api/auth/pos-device', { method: 'POST', body: { code: stale.json.data.code } }))).status).toBe(400);

    for (const user of [A.manager, A.cashier]) {
      expect((await call(posDevices.POST, makeReq('/api/pos-devices', { method: 'POST', token: tokenFor(user), body: { name: 'x' } }))).status).toBe(403);
    }
  });

  it('device token is stored hashed, the cookie is httpOnly, and revocation stops PIN login', async () => {
    await setPin(A, A.cashier.id, '1111');
    const device = await pairDevice(A);
    const row = await prisma.posDevice.findFirstOrThrow({ where: { shopId: A.shop.id } });
    expect(row.tokenHash).toBe(sha256(device));
    expect(Buffer.from(device, 'base64url').length).toBe(32);

    const revoke = await call(posDeviceItem.DELETE, makeReq(`/api/pos-devices/${row.id}`, { method: 'DELETE', token: tokenFor(A.admin) }), { id: row.id });
    expect(revoke.status).toBe(200);
    expect((await pinLogin(device, '1111')).status).toBe(401);
  });

  it('shop B admin cannot list or revoke shop A devices', async () => {
    await pairDevice(A);
    const row = await prisma.posDevice.findFirstOrThrow({ where: { shopId: A.shop.id } });
    const list = await call(posDevices.GET, makeReq('/api/pos-devices', { token: tokenFor(B.admin) }));
    expect(list.json.data).toEqual([]);
    const revoke = await call(posDeviceItem.DELETE, makeReq(`/api/pos-devices/${row.id}`, { method: 'DELETE', token: tokenFor(B.admin) }), { id: row.id });
    expect(revoke.status).toBe(404);
    expect((await prisma.posDevice.findUniqueOrThrow({ where: { id: row.id } })).revokedAt).toBeNull();
  });

  it('PINs are stored as keyed hashes, never in plaintext', async () => {
    await setPin(A, A.cashier.id, '1234');
    const row = await prisma.user.findUniqueOrThrow({ where: { id: A.cashier.id } });
    expect(row.legacyPin).toBeNull();
    expect(row.pinHash).toBe(hashPin(A.shop.id, '1234'));
    expect(row.pinHash).not.toContain('1234');
  });

  it('PIN sessions are short and not extended to 30 days', async () => {
    await setPin(A, A.cashier.id, '1111');
    const ok = await pinLogin(await pairDevice(A), '1111');
    const payload = jwt.decode(ok.json.data.token) as { exp: number; iat: number; pos: boolean };
    expect(payload.pos).toBe(true);
    expect(payload.exp - payload.iat).toBe(12 * 3600);
  });
});

describe('#3 High — rate limiter keyed on spoofable X-Forwarded-For', () => {
  it('ignores X-Forwarded-For and only trusts CF-Connecting-IP behind the tunnel', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4', 'cf-connecting-ip': '203.0.113.5' } });
    expect(getClientIp(req)).toBe('203.0.113.5');
    expect(getClientIp(new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4' } }))).toBe('unknown');
    process.env.TRUST_PROXY = '';
    try {
      expect(getClientIp(req)).toBe('unknown');
    } finally {
      process.env.TRUST_PROXY = 'cloudflare';
    }
  });

  it('login attempts from one client are limited even when XFF changes every request', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await call(
        login.POST,
        makeReq('/api/auth/login', {
          method: 'POST',
          ip: '198.51.100.50',
          headers: { 'x-forwarded-for': `10.1.1.${i}` },
          body: { identifier: `nobody${i}@x.dev`, password: 'wrong' },
        })
      );
      statuses.push(res.status);
    }
    expect(statuses[10]).toBe(429);
  });
});

const saleBody = (seed: Seed, overrides: Record<string, unknown> = {}, item: Record<string, unknown> = {}) => ({
  saleType: 'RETAIL',
  paymentMode: 'CASH',
  items: [{ medicineId: seed.medicine.id, batchId: seed.batch.id, quantity: 1, rate: 90, discount: 0, ...item }],
  ...overrides,
});

const sell = (user: Seed['admin'], body: unknown) => call(sales.POST, makeReq('/api/sales', { method: 'POST', token: tokenFor(user), body }));

describe('#4 High — sale linked to another shop’s customer', () => {
  it('rejects a customerId from another shop and leaks nothing', async () => {
    const res = await sell(A.cashier, saleBody(A, { customerId: B.customer.id }));
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('Customer not found');
    expect(await prisma.sale.count({ where: { customerId: B.customer.id, shopId: A.shop.id } })).toBe(0);
  });

  it("shop A cannot read shop B's sale", async () => {
    const res = await call(saleDetail.GET, makeReq(`/api/sales/${B.sale.id}`, { token: tokenFor(A.admin) }), { id: B.sale.id });
    expect(res.status).toBe(404);
  });
});

describe('#5 High — restore attaching another shop’s records', () => {
  it('drops foreign customer/user ids and skips sales with foreign medicines or batches', async () => {
    const backup = {
      meta: { shopId: A.shop.id, version: '2.0' },
      data: {
        sales: [
          {
            invoiceNumber: 'X-1',
            customerId: B.customer.id,
            createdByUserId: B.admin.id,
            saleType: 'RETAIL',
            subtotal: 10,
            gstTotal: 0,
            grandTotal: 10,
            paymentMode: 'CASH',
            createdAt: new Date().toISOString(),
            saleItems: [{ medicineId: A.medicine.id, batchId: A.batch.id, quantity: 1, mrp: 10, rate: 10, gst: 0, amount: 10 }],
          },
          {
            invoiceNumber: 'X-2',
            saleType: 'RETAIL',
            subtotal: 10,
            gstTotal: 0,
            grandTotal: 10,
            paymentMode: 'CASH',
            createdAt: new Date().toISOString(),
            saleItems: [{ medicineId: B.medicine.id, batchId: B.batch.id, quantity: 1, mrp: 10, rate: 10, gst: 0, amount: 10 }],
          },
        ],
      },
    };
    const res = await call(restore.POST, makeReq('/api/database/restore', { method: 'POST', token: tokenFor(A.admin), body: backup }));
    expect(res.status).toBe(200);

    const x1 = await prisma.sale.findFirstOrThrow({ where: { shopId: A.shop.id, invoiceNumber: 'X-1' } });
    expect(x1.customerId).toBeNull();
    expect(x1.createdByUserId).toBe(A.admin.id);
    expect(await prisma.sale.count({ where: { invoiceNumber: 'X-2' } })).toBe(0);
    expect(await prisma.saleItem.count({ where: { batchId: B.batch.id, sale: { shopId: A.shop.id } } })).toBe(0);
    expect(JSON.stringify(res.json)).not.toMatch(/prisma|Invalid `/i);
  });
});

describe('#6 High — client-controlled prices, GST, discounts and credit', () => {
  it('ignores client GST percent and totals; uses the medicine GST and the batch price', async () => {
    const res = await sell(A.cashier, {
      ...saleBody(A, { discountTotal: 999, gstMode: 'exclusive' }, { gstPercent: 0 }),
    });
    expect(res.status).toBe(201);
    expect(Number(res.json.data.grandTotal)).toBe(90);
    expect(Number(res.json.data.discountTotal)).toBe(0);
    expect(res.json.data.saleItems[0].gstPercent).toBe(18);
    expect(Number(res.json.data.gstTotal)).toBeCloseTo((90 * 18) / 118, 2);
  });

  it('a cashier cannot change the price', async () => {
    const res = await sell(A.cashier, saleBody(A, {}, { rate: 0.01 }));
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/manager or admin/);
  });

  it('nobody can sell above MRP', async () => {
    const res = await sell(A.admin, saleBody(A, {}, { rate: 150 }));
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/above MRP/);
  });

  it('a manager may override within cost..MRP but not below cost', async () => {
    expect((await sell(A.manager, saleBody(A, {}, { rate: 70 }))).status).toBe(201);
    const below = await sell(A.manager, saleBody(A, {}, { rate: 50 }));
    expect(below.status).toBe(400);
    expect(below.json.error).toMatch(/below purchase cost/);
  });

  it('an admin may sell below cost, with a warning and an activity log entry', async () => {
    const res = await sell(A.admin, saleBody(A, {}, { rate: 50 }));
    expect(res.status).toBe(201);
    expect(res.json.data.warnings[0]).toMatch(/below purchase cost/);
    expect(await prisma.activityLog.count({ where: { shopId: A.shop.id, action: 'SALE_BELOW_COST' } })).toBe(1);
  });

  it('enforces the per-role discount cap (defaults 10/25/100)', async () => {
    const line = 90 * 2;
    const body = (pct: number) => saleBody(A, {}, { quantity: 2, discount: (line * pct) / 100 });
    expect((await sell(A.cashier, body(10))).status).toBe(201);
    expect((await sell(A.cashier, body(11))).status).toBe(400);
    expect((await sell(A.manager, body(25))).status).toBe(201);
    expect((await sell(A.manager, body(26))).status).toBe(400);
    expect((await sell(A.admin, body(100))).status).toBe(201);
  });

  it('a discount above the line total cannot make the invoice negative', async () => {
    const res = await sell(A.admin, saleBody(A, {}, { discount: 500 }));
    expect(res.status).toBe(400);
    expect(await prisma.sale.count({ where: { shopId: A.shop.id, grandTotal: { lt: 0 } } })).toBe(0);
  });

  it('creditDue is computed from amountPaid and bounded by the total', async () => {
    const credit = (extra: Record<string, unknown>) =>
      sell(A.cashier, saleBody(A, { paymentMode: 'CREDIT', customerId: A.customer.id, ...extra }));
    expect(Number((await credit({ amountPaid: 40 })).json.data.creditDue)).toBe(50);
    expect(Number((await credit({ amountPaid: 1000 })).json.data.creditDue)).toBe(0);
    expect(Number((await credit({ creditDue: 99999 })).json.data.creditDue)).toBe(90); // legacy field clamped
    const cash = await sell(A.cashier, saleBody(A, { creditDue: 500 }));
    expect(cash.json.data.creditDue).toBeNull();
  });

  it('only an admin can change the discount caps', async () => {
    const body = { enableRetail: true, enableWholesale: true, allowDiscounts: true, enableBarcode: true, autoPrintInvoice: false, gstMode: 'inclusive', maxDiscountPercentCashier: 100 };
    const manager = await call(billingSettings.PATCH, makeReq('/api/settings/billing', { method: 'PATCH', token: tokenFor(A.manager), body }));
    expect(manager.status).toBe(403);
    const admin = await call(billingSettings.PATCH, makeReq('/api/settings/billing', { method: 'PATCH', token: tokenFor(A.admin), body: { ...body, maxDiscountPercentCashier: 5 } }));
    expect(admin.status).toBe(200);
    expect((await sell(A.cashier, saleBody(A, {}, { discount: 9 }))).status).toBe(400);
  });

  it('concurrent sales of the last unit: exactly one succeeds', async () => {
    await prisma.inventoryBatch.update({ where: { id: A.batch.id }, data: { stockQty: 1 } });
    const results = await Promise.all([sell(A.cashier, saleBody(A)), sell(A.manager, saleBody(A))]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect((await prisma.inventoryBatch.findUniqueOrThrow({ where: { id: A.batch.id } })).stockQty).toBe(0);
  });

  it('concurrent sales never share an invoice number', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => sell(A.cashier, saleBody(A))));
    const numbers = results.map((r) => r.json.data.invoiceNumber);
    expect(new Set(numbers).size).toBe(5);
  });
});

const returnBody = (seed: Seed, extra: Record<string, unknown> = {}) => ({
  type: 'CUSTOMER',
  saleItemId: seed.saleItem.id,
  medicineId: seed.medicine.id,
  quantity: 1,
  reason: 'Damaged pack',
  expiryDate: seed.batch.expiryDate,
  mrp: 100,
  ...extra,
});
const doReturn = (user: Seed['admin'], body: unknown) =>
  call(returns.POST, makeReq('/api/returns', { method: 'POST', token: tokenFor(user), body }));

describe('#7 High — unlimited / double customer returns with client refund price', () => {
  it('requires the original sale item for customer returns', async () => {
    const { saleItemId: _drop, ...noSaleItem } = returnBody(A, { quantity: 500 });
    const res = await doReturn(A.manager, noSaleItem);
    expect(res.status).toBe(400);
    expect((await prisma.inventoryBatch.findUniqueOrThrow({ where: { id: A.batch.id } })).stockQty).toBe(50);
  });

  it('cannot return more than sold, nor return twice past the sold quantity', async () => {
    expect((await doReturn(A.manager, returnBody(A, { quantity: 3 }))).status).toBe(400);
    expect((await doReturn(A.manager, returnBody(A, { quantity: 2 }))).status).toBe(200);
    expect((await doReturn(A.manager, returnBody(A, { quantity: 1 }))).status).toBe(400);
  });

  it('two concurrent returns of the same unit: only one succeeds', async () => {
    const results = await Promise.all([
      doReturn(A.manager, returnBody(A, { quantity: 2 })),
      doReturn(A.admin, returnBody(A, { quantity: 2 })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    const total = await prisma.medicineReturn.aggregate({ where: { saleItemId: A.saleItem.id }, _sum: { quantity: true } });
    expect(total._sum.quantity).toBe(2);
  });

  it('refund price comes from the sale, not the request', async () => {
    const res = await doReturn(A.manager, returnBody(A, { mrp: 99999 }));
    expect(res.status).toBe(200);
    expect(Number(res.json.data.mrp)).toBe(100);
  });

  it("cannot return against another shop's sale item", async () => {
    const res = await doReturn(A.manager, returnBody(B, { medicineId: undefined }));
    expect(res.status).toBe(400);
    expect(await prisma.medicineReturn.count()).toBe(0);
  });
});

describe('#8 High — sessions survive password change / deactivation / role change', () => {
  const whoAmI = (token: string) => call(profile.GET, makeReq('/api/settings/profile', { token }));

  it('changing a password kills older tokens and keeps the changer logged in', async () => {
    const stolen = tokenFor(A.cashier);
    const res = await call(
      changePassword.POST,
      makeReq('/api/users/change-password', { method: 'POST', token: tokenFor(A.admin), body: { userId: A.cashier.id, newPassword: 'NewPassword9' } })
    );
    expect(res.status).toBe(200);
    expect((await whoAmI(stolen)).status).toBe(401);

    const selfOld = tokenFor(A.admin);
    const self = await call(
      changePassword.POST,
      makeReq('/api/users/change-password', { method: 'POST', token: selfOld, body: { userId: A.admin.id, newPassword: 'NewPassword9', currentPassword: PASSWORD } })
    );
    expect((await whoAmI(selfOld)).status).toBe(401);
    expect((await whoAmI(setCookie(self.res, 'auth-token')!)).status).toBe(200);
  });

  it('profile password change kills older tokens', async () => {
    const old = tokenFor(A.manager);
    const res = await call(
      profile.PUT,
      makeReq('/api/settings/profile', { method: 'PUT', token: old, body: { name: 'Manager', email: A.manager.email, password: 'Another123', currentPassword: PASSWORD } })
    );
    expect(res.status).toBe(200);
    expect((await whoAmI(old)).status).toBe(401);
    expect((await whoAmI(setCookie(res.res, 'auth-token')!)).status).toBe(200);
  });

  it('deactivation and role change kill older tokens', async () => {
    const cashierToken = tokenFor(A.cashier);
    const managerToken = tokenFor(A.manager);
    const put = (id: string, body: unknown) =>
      call(teamMember.PUT, makeReq(`/api/users/${id}`, { method: 'PUT', token: tokenFor(A.admin), body }), { id });
    expect((await put(A.cashier.id, { isActive: false })).status).toBe(200);
    expect((await put(A.manager.id, { role: 'CASHIER' })).status).toBe(200);
    expect((await whoAmI(cashierToken)).status).toBe(401);
    expect((await whoAmI(managerToken)).status).toBe(401);
  });

  it('rejects alg:none and tokens without a version', async () => {
    const none = jwt.sign({ userId: A.admin.id, shopId: A.shop.id, email: A.admin.email, role: 'ADMIN', tv: 0 }, '', { algorithm: 'none' });
    expect((await whoAmI(none)).status).toBe(401);
    const legacy = jwt.sign({ userId: A.admin.id, shopId: A.shop.id, email: A.admin.email, role: 'ADMIN' }, process.env.JWT_SECRET!);
    expect((await whoAmI(legacy)).status).toBe(401);
    const hs512 = jwt.sign({ userId: A.admin.id, shopId: A.shop.id, role: 'ADMIN', tv: 0 }, process.env.JWT_SECRET!, { algorithm: 'HS512' });
    expect((await whoAmI(hs512)).status).toBe(401);
  });
});

describe('#9 High — browser profile with saved logins committed to git', () => {
  it('no .gemini/ or *.log file exists anywhere in git history, and both are ignored', () => {
    const history = execSync("git log --all --format=%H --name-only -- '.gemini' '*.log'", { encoding: 'utf8' }).trim();
    expect(history).toBe('');
    const ignored = execSync('git check-ignore .gemini/x devserver.log', { encoding: 'utf8' }).trim().split('\n');
    expect(ignored).toEqual(['.gemini/x', 'devserver.log']);
  });
});

describe('#10 High — AI quota drained by any user of any shop', () => {
  const importReq = (user: Seed['admin']) => {
    const form = new FormData();
    form.set('extractedText', 'Ashwagandha 60 tab MRP 120');
    return makeReq('/api/medicines/import', { method: 'POST', token: tokenFor(user) });
  };

  it('cashiers cannot start AI imports', async () => {
    expect((await call(medicineImport.POST, importReq(A.cashier))).status).toBe(403);
    expect((await call(priceListImport.POST, makeReq('/api/medicine/import-price-list', { method: 'POST', token: tokenFor(A.cashier) }))).status).toBe(403);
  });

  it('a shop that used its daily AI calls gets 429; other shops are unaffected', async () => {
    await prisma.aiCallLog.createMany({
      data: Array.from({ length: 200 }, (_, i) => ({
        requestId: `r${i}`, feature: 'MEDICINE_IMPORT' as const, adapter: 'x', providerName: 'x', success: true, latencyMs: 1, shopId: A.shop.id,
      })),
    });
    const capped = await call(medicineImport.POST, importReq(A.admin));
    expect(capped.status).toBe(429);
    expect(capped.json.errorCode).toBe('SHOP_AI_CAP');
    // Shop B passes the gate (fails later on the empty body, not on the cap).
    const other = await call(medicineImport.POST, importReq(B.admin));
    expect(other.status).not.toBe(429);
  });

  it('per-user burst limit', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await call(medicineImport.POST, importReq(A.manager))).status);
    expect(statuses[10]).toBe(429);
  });
});

describe('#11 High — Next.js with known DoS advisory', () => {
  it('runs a patched Next.js (>= 16.4.3)', async () => {
    const { version } = (await import('next/package.json')).default as { version: string };
    const [major, minor, patch] = version.split('.').map(Number);
    expect(major * 1e6 + minor * 1e3 + patch).toBeGreaterThanOrEqual(16_004_003);
  });
});
