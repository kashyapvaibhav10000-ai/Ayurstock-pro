/**
 * Dependency upgrades (zod 4, nodemailer 10) and the remaining audit Lows:
 * strict request schemas, mail through a mock transport, failed logins for
 * unknown identifiers, server-side page role checks.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { call, makeReq, prisma, resetDb, seedShop, tokenFor, Seed } from './helpers';

const sent: Array<Record<string, unknown>> = [];
const transportOptions: Array<Record<string, unknown>> = [];
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn((options: Record<string, unknown>) => {
      transportOptions.push(options);
      return { sendMail: vi.fn(async (message: Record<string, unknown>) => (sent.push(message), { messageId: 'mock' })) };
    }),
  },
}));

// Page layouts read the session cookie through next/headers.
let pageCookie: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'auth-token' && pageCookie ? { value: pageCookie } : undefined) }),
}));

import * as login from '@/app/api/auth/login/route';
import * as posLogin from '@/app/api/auth/pos-login/route';
import * as posDevices from '@/app/api/pos-devices/route';
import * as posDevice from '@/app/api/auth/pos-device/route';
import * as loginHistory from '@/app/api/admin/login-history/route';
import * as sales from '@/app/api/sales/route';
import * as stockAdjustment from '@/app/api/stock-adjustment/route';
import * as billingSettings from '@/app/api/settings/billing/route';
import * as expirySend from '@/app/api/expiry-alerts/send/route';
import * as cron from '@/app/api/cron/expiry-alerts/route';
import { setCookie } from './helpers';
import { LoginSchema, validationMessage, CreateSaleSchema } from '@/lib/schemas';
import PurchasesLayout from '@/app/dashboard/purchases/layout';
import SettingsLayout from '@/app/dashboard/settings/layout';
import CustomersLayout from '@/app/dashboard/customers/layout';

let A: Seed;

beforeEach(async () => {
  await resetDb();
  sent.length = 0;
  transportOptions.length = 0;
  pageCookie = undefined;
  A = await seedShop('A');
});

describe('zod 4: request schemas are strict', () => {
  it('rejects unknown keys at the top level and in nested objects', async () => {
    expect(LoginSchema.safeParse({ identifier: 'a', password: 'b', role: 'ADMIN' }).success).toBe(false);
    const sale = {
      saleType: 'RETAIL',
      paymentMode: 'CASH',
      items: [{ medicineId: A.medicine.id, batchId: A.batch.id, quantity: 1, rate: 90, discount: 0 }],
    };
    expect(CreateSaleSchema.safeParse(sale).success).toBe(true);
    expect(CreateSaleSchema.safeParse({ ...sale, shopId: 'other' }).success).toBe(false);
    expect(CreateSaleSchema.safeParse({ ...sale, items: [{ ...sale.items[0], mrp: 1 }] }).success).toBe(false);
  });

  it('routes answer 400 for extra keys instead of ignoring them', async () => {
    const res = await call(
      sales.POST,
      makeReq('/api/sales', {
        method: 'POST',
        token: tokenFor(A.cashier),
        body: { saleType: 'RETAIL', paymentMode: 'CASH', createdByUserId: A.admin.id, items: [{ medicineId: A.medicine.id, quantity: 1, rate: 0, discount: 0 }] },
      })
    );
    expect(res.status).toBe(400);
    expect(await prisma.sale.count({ where: { shopId: A.shop.id } })).toBe(1); // only the seeded one

    const adj = await call(
      stockAdjustment.POST,
      makeReq('/api/stock-adjustment', { method: 'POST', token: tokenFor(A.manager), body: { batchId: A.batch.id, type: 'ADD', quantity: 1, reason: 'Found', shopId: 'x' } })
    );
    expect(adj.status).toBe(400);
  });

  it('keeps array caps and readable field errors', () => {
    const items = Array.from({ length: 501 }, () => ({ medicineId: 'm', quantity: 1, rate: 1, discount: 0 }));
    const parsed = CreateSaleSchema.safeParse({ saleType: 'RETAIL', paymentMode: 'CASH', items });
    expect(parsed.success).toBe(false);
    const bad = LoginSchema.safeParse({ password: '' });
    expect(bad.success).toBe(false);
    expect(validationMessage(bad.error!)).toMatch(/^Validation error: \{.*password/);
  });

  it('the billing settings UI payload still validates', async () => {
    const body = { enableRetail: true, enableWholesale: true, allowDiscounts: true, enableBarcode: true, autoPrintInvoice: false, gstMode: 'inclusive', maxDiscountPercentCashier: 10, maxDiscountPercentManager: 25, maxDiscountPercentAdmin: 100 };
    expect((await call(billingSettings.PATCH, makeReq('/api/settings/billing', { method: 'PATCH', token: tokenFor(A.admin), body }))).status).toBe(200);
  });
});

describe('nodemailer 10: expiry alert email through a mock transport', () => {
  beforeEach(async () => {
    process.env.SMTP_HOST = 'smtp.test.local';
    process.env.SMTP_PORT = '465';
    process.env.SMTP_USER = 'alerts@test.local';
    process.env.SMTP_PASS = 'secret';
    await prisma.expiryAlertSettings.create({
      data: { shopId: A.shop.id, enableEmail: true, enableWhatsApp: false, emailAddress: 'owner@shop.test', whatsappNumber: '' },
    });
    // A batch expiring next month so the report has a line.
    const soon = new Date();
    soon.setUTCMonth(soon.getUTCMonth() + 1);
    await prisma.inventoryBatch.update({ where: { id: A.batch.id }, data: { expiryDate: soon } });
  });

  it('manual send: one plain-text mail to the shop address over implicit TLS', async () => {
    const res = await call(expirySend.POST, makeReq('/api/expiry-alerts/send', { method: 'POST', token: tokenFor(A.manager), body: {} }));
    expect(res.status).toBe(200);
    expect(res.json.data.emailSent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'owner@shop.test', from: '"Ayur-stock Pro" <alerts@test.local>' });
    expect(String(sent[0].subject)).toContain(`Shop A`);
    expect(String(sent[0].text)).toContain(A.medicine.name);
    expect(transportOptions[0]).toMatchObject({ host: 'smtp.test.local', port: 465, secure: true, auth: { user: 'alerts@test.local', pass: 'secret' } });
  });

  it('a transport failure is reported without SMTP details', async () => {
    const nodemailer = (await import('nodemailer')).default as unknown as { createTransport: ReturnType<typeof vi.fn> };
    nodemailer.createTransport.mockImplementationOnce(() => ({ sendMail: async () => { throw new Error('535 auth failed for alerts@test.local on smtp.test.local'); } }));
    const res = await call(expirySend.POST, makeReq('/api/expiry-alerts/send', { method: 'POST', token: tokenFor(A.manager), body: {} }));
    expect(res.json.data.emailSent).toBe(false);
    expect(res.json.data.emailError).not.toMatch(/535|smtp\.test|alerts@/);
  });

  it('monthly cron sends the same mail', async () => {
    process.env.CRON_SECRET = 'cron-secret-value-0123456789';
    try {
      const res = await call(cron.GET, makeReq('/api/cron/expiry-alerts', { headers: { authorization: 'Bearer cron-secret-value-0123456789' } }));
      expect(res.status).toBe(200);
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe('owner@shop.test');
    } finally {
      delete process.env.CRON_SECRET;
    }
  });
});

describe('Low: failed logins for unknown identifiers are recorded', () => {
  it('stores identifier, IP and status, never the password', async () => {
    const res = await call(login.POST, makeReq('/api/auth/login', { method: 'POST', ip: '198.51.100.77', body: { identifier: 'ghost@nowhere.dev', password: 'Hunter2-secret' } }));
    expect(res.status).toBe(401);
    const rows = await prisma.loginHistory.findMany({ where: { identifier: 'ghost@nowhere.dev' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: null, shopId: null, status: 'failed', ipAddress: '198.51.100.77' });
    expect(JSON.stringify(rows)).not.toContain('Hunter2-secret');
  });

  it('wrong POS PINs are recorded against the shop and shown to its admin only', async () => {
    const created = await call(posDevices.POST, makeReq('/api/pos-devices', { method: 'POST', token: tokenFor(A.admin), body: { name: 'Till 9' } }));
    const paired = await call(posDevice.POST, makeReq('/api/auth/pos-device', { method: 'POST', body: { code: created.json.data.code } }));
    const device = setCookie(paired.res, 'pos-device')!;
    await call(posLogin.POST, makeReq('/api/auth/pos-login', { method: 'POST', body: { pin: '9999' }, cookies: { 'pos-device': device } }));

    const row = await prisma.loginHistory.findFirstOrThrow({ where: { identifier: 'pos-device:Till 9' } });
    expect(row).toMatchObject({ userId: null, shopId: A.shop.id, status: 'failed' });
    expect(JSON.stringify(row)).not.toContain('9999');

    const own = await call(loginHistory.GET, makeReq('/api/admin/login-history?status=failed', { token: tokenFor(A.admin) }));
    expect(JSON.stringify(own.json)).toContain('pos-device:Till 9');
    const B = await seedShop('B');
    const other = await call(loginHistory.GET, makeReq('/api/admin/login-history?status=failed', { token: tokenFor(B.admin) }));
    expect(JSON.stringify(other.json)).not.toContain('pos-device:Till 9');
  });
});

/** Run a layout and return where it redirected, or null if it rendered. */
async function redirectOf(layout: (props: { children: React.ReactNode }) => Promise<unknown>) {
  try {
    await layout({ children: null });
    return null;
  } catch (error) {
    const digest = (error as { digest?: string }).digest || '';
    if (!digest.startsWith('NEXT_REDIRECT')) throw error;
    return digest.split(';')[2];
  }
}

describe('Low: back-office pages are checked on the server', () => {
  it('a cashier opening a back-office URL is sent to billing', async () => {
    pageCookie = tokenFor(A.cashier);
    expect(await redirectOf(PurchasesLayout)).toBe('/dashboard/billing');
    expect(await redirectOf(CustomersLayout)).toBe('/dashboard/billing');
    expect(await redirectOf(SettingsLayout)).toBe('/dashboard/billing');
  });

  it('managers reach back-office pages but not settings; admins reach both', async () => {
    pageCookie = tokenFor(A.manager);
    expect(await redirectOf(PurchasesLayout)).toBeNull();
    expect(await redirectOf(SettingsLayout)).toBe('/dashboard/billing');
    pageCookie = tokenFor(A.admin);
    expect(await redirectOf(PurchasesLayout)).toBeNull();
    expect(await redirectOf(SettingsLayout)).toBeNull();
  });

  it('no session goes to login', async () => {
    expect(await redirectOf(PurchasesLayout)).toBe('/login');
  });
});
