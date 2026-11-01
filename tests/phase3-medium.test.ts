/**
 * Security audit, phase 3: one block per Medium finding (plus the Lows fixed
 * on the way). Each test replays the attack and asserts it now fails.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { call, makeReq, prisma, resetDb, seedShop, setCookie, tokenFor, PASSWORD, Seed } from './helpers';
import { assertPublicHttpsUrl, isPrivateAddress, UnsafeUrlError } from '@/lib/net-guard';
import { fetchWithTimeout } from '@/lib/ai/providers/http';
import { proxy } from '@/proxy';
import { detectFileType, runLimited } from '@/lib/upload';
import { clientErrorMessage } from '@/lib/errors';
import { csvCell } from '@/lib/csv';
import { hashPassword } from '@/lib/auth';
import { Prisma } from '@prisma/client';

import * as login from '@/app/api/auth/login/route';
import * as profile from '@/app/api/settings/profile/route';
import * as credits from '@/app/api/credits/route';
import * as medicinesExport from '@/app/api/medicines/export/route';
import * as inventoryExport from '@/app/api/inventory/export/route';
import * as returnsExport from '@/app/api/returns/export/route';
import * as medicineImport from '@/app/api/medicines/import/route';
import * as importProgress from '@/app/api/medicines/import/progress/route';
import * as importCsv from '@/app/api/settings/import-csv/route';
import * as bulkImport from '@/app/api/medicine/bulk-import/route';
import * as cron from '@/app/api/cron/expiry-alerts/route';
import * as rackItem from '@/app/api/settings/rack-locations/[id]/route';

import * as salesHistory from '@/app/api/sales-history/route';
import * as reports from '@/app/api/reports/route';
import * as customers from '@/app/api/customers/route';
import * as suppliers from '@/app/api/suppliers/route';
import * as supplierItem from '@/app/api/suppliers/[id]/route';
import * as purchases from '@/app/api/purchases/route';
import * as purchaseReturns from '@/app/api/purchases/returns/route';
import * as inventoryArchived from '@/app/api/inventory/archived/route';
import * as medicinesArchived from '@/app/api/medicines/archived/route';
import * as reorderList from '@/app/api/inventory/reorder-list/route';
import * as batchDetails from '@/app/api/inventory/batch-details/route';
import * as medicineBatches from '@/app/api/inventory/medicine-batches/[medicineId]/route';
import * as companies from '@/app/api/companies/route';
import * as salesSearch from '@/app/api/sales/search/route';
import * as saleItems from '@/app/api/sales/[id]/items/route';
import * as lastMrp from '@/app/api/medicines/[id]/last-mrp/route';
import * as expirySend from '@/app/api/expiry-alerts/send/route';
import * as returnsMedicines from '@/app/api/returns/medicines/route';
import * as billingSearch from '@/app/api/billing/search/route';
import * as inventoryBatches from '@/app/api/inventory/batches/route';
import * as saleDetail from '@/app/api/sales/[id]/route';
import * as billingSettings from '@/app/api/settings/billing/route';
import * as dashboardAlerts from '@/app/api/dashboard/alerts/route';
import nextConfig from '@/next.config.js';

let A: Seed;
let B: Seed;

beforeEach(async () => {
  await resetDb();
  A = await seedShop('A');
  B = await seedShop('B');
});

describe('#12 Medium — SSRF through the OpenAI-compatible base URL', () => {
  it('classifies private, loopback, link-local, metadata and unique-local addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.29.210', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:169.254.169.254']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('refuses http, credentials, localhost and private IP literals', async () => {
    for (const url of ['http://api.example.com', 'https://user:pw@api.example.com', 'https://localhost/v1', 'https://127.0.0.1/v1', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/v1', 'https://10.0.0.5/', 'https://[::ffff:7f00:1]/', 'https://metadata.google.internal/']) {
      await expect(assertPublicHttpsUrl(url), url).rejects.toBeInstanceOf(UnsafeUrlError);
    }
  });

  it('re-checks DNS: a public-looking name that resolves to loopback is refused', async () => {
    // localtest.me is a public DNS name whose A record is 127.0.0.1.
    try {
      await assertPublicHttpsUrl('https://localtest.me/v1');
      throw new Error('should have been refused');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOTFOUND' || (error as NodeJS.ErrnoException).code === 'EAI_AGAIN') return; // no DNS in this sandbox
      expect(error).toBeInstanceOf(UnsafeUrlError);
    }
  });

  it('the provider fetch refuses private targets before sending the key', async () => {
    await expect(fetchWithTimeout('https://127.0.0.1/chat', { headers: { Authorization: 'Bearer sk-secret' } }, 1000)).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});

describe('#13 Medium — missing security headers', () => {
  it('sends CSP with frame-ancestors none, HSTS, XFO, nosniff, Referrer-Policy, Permissions-Policy on every path', async () => {
    // CSP is per request (nonce) from the proxy; the rest are static headers.
    const csp = (await proxy(new NextRequest(new URL('/login', 'https://shop.example.com')))).headers.get('content-security-policy');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");

    const rules = await (nextConfig as { headers: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>> }).headers();
    const all = rules.find((r) => r.source === '/:path*')!;
    const byKey = Object.fromEntries(all.headers.map((h) => [h.key, h.value]));
    expect(byKey['Strict-Transport-Security']).toMatch(/max-age=\d{8}/);
    expect(byKey['X-Frame-Options']).toBe('DENY');
    expect(byKey['X-Content-Type-Options']).toBe('nosniff');
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(byKey['Permissions-Policy']).toContain('camera=()');
  });
});

describe('#14 Medium — session token readable by page scripts', () => {
  it('login sets only the httpOnly cookie; the body carries no token', async () => {
    const res = await call(login.POST, makeReq('/api/auth/login', { method: 'POST', body: { identifier: A.admin.email, password: PASSWORD } }));
    expect(res.status).toBe(200);
    expect(res.json.data.token).toBeUndefined();
    const cookie = res.res.headers.getSetCookie().find((c) => c.startsWith('auth-token='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
  });

  it('a Bearer header alone is not a session', async () => {
    const req = makeReq('/api/settings/profile', { headers: { authorization: `Bearer ${tokenFor(A.admin)}` } });
    expect((await call(profile.GET, req)).status).toBe(401);
  });
});

const apiReq = (method: string, headers: Record<string, string>) =>
  new NextRequest(new URL('/api/sales', 'https://shop.example.com'), { method, headers: { host: 'shop.example.com', ...headers } });

describe('#15 Medium — CSRF on state-changing routes', () => {
  it('refuses a foreign or null Origin on POST/PUT/PATCH/DELETE', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect((await proxy(apiReq(method, { origin: 'https://evil.example' }))).status, method).toBe(403);
    }
    expect((await proxy(apiReq('POST', { origin: 'null' }))).status).toBe(403);
    expect((await proxy(apiReq('POST', { 'sec-fetch-site': 'cross-site' }))).status).toBe(403);
  });

  it('lets same-origin writes and all reads through', async () => {
    expect((await proxy(apiReq('POST', { origin: 'https://shop.example.com' }))).headers.get('x-middleware-next')).toBe('1');
    expect((await proxy(apiReq('POST', { 'sec-fetch-site': 'same-origin' }))).headers.get('x-middleware-next')).toBe('1');
    expect((await proxy(apiReq('GET', { origin: 'https://evil.example' }))).headers.get('x-middleware-next')).toBe('1');
  });
});

describe('#16 Medium — credit write-off by any role / negative payments', () => {
  const pay = (user: Seed['admin'], amount: unknown) =>
    call(credits.PATCH, makeReq('/api/credits', { method: 'PATCH', token: tokenFor(user), body: { saleId: A.sale.id, amount } }));

  it('cashiers cannot record payments; negative or zero amounts are refused', async () => {
    expect((await pay(A.cashier, 180)).status).toBe(403);
    expect((await pay(A.manager, -500)).status).toBe(400);
    expect((await pay(A.manager, 0)).status).toBe(400);
    expect(Number((await prisma.sale.findUniqueOrThrow({ where: { id: A.sale.id } })).creditDue)).toBe(180);
    expect((await pay(A.manager, 80)).status).toBe(200);
    expect(Number((await prisma.sale.findUniqueOrThrow({ where: { id: A.sale.id } })).creditDue)).toBe(100);
  });
});

describe('#17 Medium — CSV formula injection in exports', () => {
  it('prefixes = + - @ tab CR with an apostrophe in every export', async () => {
    const evil = '=HYPERLINK("http://evil","x")';
    await prisma.medicine.update({ where: { id: A.medicine.id }, data: { name: evil, company: '+cmd|calc' } });
    await prisma.medicineReturn.create({
      data: { shopId: A.shop.id, medicineId: A.medicine.id, batchNumber: '@SUM(1)', expiryDate: new Date(), mrp: 1, quantity: 1, reason: '-2+3', type: 'CUSTOMER', status: 'PROCESSED', createdByUserId: A.admin.id },
    });
    const token = tokenFor(A.admin);
    const outputs = [
      (await call(medicinesExport.GET, makeReq('/api/medicines/export', { token }))).json as string,
      (await call(inventoryExport.GET, makeReq('/api/inventory/export', { token }))).json as string,
      (await call(returnsExport.GET, makeReq('/api/returns/export', { token }))).json as string,
    ];
    for (const csv of outputs) {
      expect(csv).toContain(`"'${evil.replace(/"/g, '""')}"`);
      expect(csv).not.toMatch(/(^|,)"?=HYPERLINK/m);
    }
    expect(outputs[0]).toContain(`"'+cmd|calc"`);
    expect(outputs[2]).toContain(`"'@SUM(1)"`);
    expect(outputs[2]).toContain(`"'-2+3"`);
    expect(csvCell('\tx')).toBe(`"'\tx"`);
  });
});

describe('#18 Medium — upload type spoofing and oversized bodies', () => {
  it('detects type from magic bytes, not the declared type', () => {
    expect(detectFileType(Buffer.from('%PDF-1.7 ...'))?.mime).toBe('application/pdf');
    expect(detectFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.mime).toBe('image/png');
    expect(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe('image/jpeg');
    expect(detectFileType(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    expect(detectFileType(Buffer.from('<html><script>'))).toBeNull();
  });

  it('a file claiming to be a PDF but containing HTML is refused', async () => {
    const form = new FormData();
    form.set('file', new File(['<html><script>alert(1)</script></html>'], 'invoice.pdf', { type: 'application/pdf' }));
    const req = new NextRequest(new URL('/api/medicines/import', 'http://localhost'), {
      method: 'POST',
      body: form,
      headers: { cookie: `auth-token=${tokenFor(A.admin)}` },
    });
    const res = await call(medicineImport.POST, req);
    expect(res.status).toBe(400);
    expect(await prisma.importJob.count()).toBe(0);
  });

  it('bodies over 20 MB are refused by the proxy before any route reads them', async () => {
    const res = await proxy(apiReq('POST', { origin: 'https://shop.example.com', 'content-length': String(30 * 1024 * 1024) }));
    expect(res.status).toBe(413);
  });

  it('OCR jobs run one at a time', async () => {
    let release!: () => void;
    const first = runLimited('ocr-test', 1, () => new Promise<void>((r) => (release = r)));
    expect(await runLimited('ocr-test', 1, async () => 'second')).toEqual({ busy: true });
    release();
    expect((await first).busy).toBe(false);
    expect(await runLimited('ocr-test', 1, async () => 'third')).toEqual({ busy: false, value: 'third' });
  });
});

describe('#19 Medium — import progress readable across shops', () => {
  it("shop A cannot read shop B's import job", async () => {
    const job = await prisma.importJob.create({ data: { shopId: B.shop.id, medicines: '["SECRET"]', status: 'done' } });
    const res = await call(importProgress.GET, makeReq(`/api/medicines/import/progress?jobId=${job.id}`, { token: tokenFor(A.admin) }));
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.json)).not.toContain('SECRET');
  });
});

describe('#20 Medium — database errors sent to the browser', () => {
  it('never passes Prisma errors through', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError('Invalid `prisma.user.update()` invocation in /home/x/app/route.ts', { code: 'P2025', clientVersion: '5' });
    expect(clientErrorMessage(prismaError, 'Failed')).toBe('Failed');
    expect(clientErrorMessage(new Error('connect ECONNREFUSED 10.0.0.1:5432'), 'Failed')).toBe('Failed');
    expect(clientErrorMessage(new Error('Batch 12 has only 3 units'), 'Failed')).toBe('Batch 12 has only 3 units');
  });

  it('an unknown rack id gives a clean 404, not a Prisma dump', async () => {
    const res = await call(rackItem.PUT, makeReq('/api/settings/rack-locations/nope', { method: 'PUT', token: tokenFor(A.admin), body: { name: 'X' } }), { id: 'nope' });
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.json)).not.toMatch(/prisma|invocation/i);
  });
});

/** Make the next INSERT of a medicine with this name fail inside Postgres. */
async function failInsertsNamed(name: string) {
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION test_fail_medicine() RETURNS trigger AS $$
    BEGIN IF NEW.name = '${name}' THEN RAISE EXCEPTION 'forced failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql;`);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_fail_medicine ON "Medicine"`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER test_fail_medicine BEFORE INSERT ON "Medicine" FOR EACH ROW EXECUTE FUNCTION test_fail_medicine()`);
}
const dropFailTrigger = () => prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_fail_medicine ON "Medicine"`);

describe('#22 Medium — partial imports', () => {
  it('CSV import is all-or-nothing', async () => {
    await failInsertsNamed('BOOM');
    try {
      const csvData = [
        'Medicine Name,Company,Batch Number,Expiry Date,Quantity,Purchase Rate,MRP,Rack Location',
        'Good One,Co,G1,2030-01-31,5,10,20,R1',
        'BOOM,Co,B1,2030-01-31,5,10,20,R1',
      ].join('\n');
      const res = await call(importCsv.POST, makeReq('/api/settings/import-csv', { method: 'POST', token: tokenFor(A.admin), body: { csvData } }));
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.json)).not.toContain('forced failure');
      expect(await prisma.medicine.count({ where: { shopId: A.shop.id, name: 'Good One' } })).toBe(0);
      expect(await prisma.inventoryBatch.count({ where: { shopId: A.shop.id, batchNumber: 'G1' } })).toBe(0);
    } finally {
      await dropFailTrigger();
    }
  });

  it('invoice bulk import is all-or-nothing', async () => {
    await failInsertsNamed('BOOM');
    try {
      const medicines = [
        { name: 'Good One', company: 'Co', batchNo: 'G1', expiryDate: '01/30', quantity: 5, mrp: 20, purchaseRate: 10 },
        { name: 'BOOM', company: 'Co', batchNo: 'B1', expiryDate: '01/30', quantity: 5, mrp: 20, purchaseRate: 10 },
      ];
      const res = await call(bulkImport.POST, makeReq('/api/medicine/bulk-import', { method: 'POST', token: tokenFor(A.admin), body: { medicines } }));
      expect(res.status).toBe(500);
      expect(await prisma.medicine.count({ where: { shopId: A.shop.id, name: 'Good One' } })).toBe(0);
    } finally {
      await dropFailTrigger();
    }
  });

  it('AI-extracted rows outside sane bounds are never written (prompt-injection guard)', async () => {
    const medicines = [
      { name: 'Negative', company: 'Co', batchNo: 'N1', expiryDate: '01/30', quantity: 5, mrp: -1, purchaseRate: 10 },
      { name: 'Fraction', company: 'Co', batchNo: 'F1', expiryDate: '01/30', quantity: 1.5, mrp: 20, purchaseRate: 10 },
      { name: 'Huge', company: 'Co', batchNo: 'H1', expiryDate: '01/30', quantity: 5, mrp: 1e12, purchaseRate: 10 },
      { name: 'Fine', company: 'Co', batchNo: 'OK1', expiryDate: '01/30', quantity: 5, mrp: 20, purchaseRate: 10 },
    ];
    const res = await call(bulkImport.POST, makeReq('/api/medicine/bulk-import', { method: 'POST', token: tokenFor(A.admin), body: { medicines } }));
    expect(res.status).toBe(200);
    const names = (await prisma.medicine.findMany({ where: { shopId: A.shop.id, name: { in: ['Negative', 'Fraction', 'Huge', 'Fine'] } } })).map((m) => m.name);
    expect(names).toEqual(['Fine']);
  });
});

describe('#23 Medium — weak password hashing / policy', () => {
  it('hashes with bcrypt cost 12 and rejects passwords under 8 characters', async () => {
    expect(await hashPassword('whatever1')).toMatch(/^\$2[aby]\$12\$/);
    const res = await call(
      profile.PUT,
      makeReq('/api/settings/profile', { method: 'PUT', token: tokenFor(A.manager), body: { name: 'Manager', email: A.manager.email, password: 'short7!', currentPassword: PASSWORD } })
    );
    expect(res.status).toBe(400);
  });
});

describe('C Medium — cashiers reaching back-office data through the API', () => {
  const t = () => tokenFor(A.cashier);
  const staffOnly: Array<[string, () => Promise<{ status: number }>]> = [
    ['GET sales-history', () => call(salesHistory.GET, makeReq('/api/sales-history', { token: t() }))],
    ['GET credits', () => call(credits.GET, makeReq('/api/credits', { token: t() }))],
    ['GET reports', () => call(reports.GET, makeReq('/api/reports?type=daily', { token: t() }))],
    ['GET customers', () => call(customers.GET, makeReq('/api/customers', { token: t() }))],
    ['POST customers', () => call(customers.POST, makeReq('/api/customers', { method: 'POST', token: t(), body: { name: 'Xx', phone: '9999999999', address: 'Street 9' } }))],
    ['PATCH customers', () => call(customers.PATCH, makeReq('/api/customers', { method: 'PATCH', token: t(), body: { id: A.customer.id, name: 'Hacked' } }))],
    ['GET suppliers', () => call(suppliers.GET, makeReq('/api/suppliers', { token: t() }))],
    ['GET suppliers/[id]', () => call(supplierItem.GET, makeReq('/api/suppliers/x', { token: t() }), { id: A.supplier.id })],
    ['GET purchases', () => call(purchases.GET, makeReq('/api/purchases', { token: t() }))],
    ['GET purchases/returns', () => call(purchaseReturns.GET, makeReq('/api/purchases/returns', { token: t() }))],
    ['GET inventory/archived', () => call(inventoryArchived.GET, makeReq('/api/inventory/archived', { token: t() }))],
    ['GET medicines/archived', () => call(medicinesArchived.GET, makeReq('/api/medicines/archived', { token: t() }))],
    ['GET inventory/reorder-list', () => call(reorderList.GET, makeReq('/api/inventory/reorder-list', { token: t() }))],
    ['GET inventory/batch-details', () => call(batchDetails.GET, makeReq(`/api/inventory/batch-details?batchId=${A.batch.id}`, { token: t() }))],
    ['GET inventory/medicine-batches', () => call(medicineBatches.GET, makeReq('/api/inventory/medicine-batches/x', { token: t() }), { medicineId: A.medicine.id })],
    ['GET companies', () => call(companies.GET, makeReq('/api/companies', { token: t() }))],
    ['GET sales/search', () => call(salesSearch.GET, makeReq('/api/sales/search?q=INV', { token: t() }))],
    ['GET sales/[id]/items', () => call(saleItems.GET, makeReq('/api/sales/x/items', { token: t() }), { id: A.sale.id })],
    ['GET medicines/[id]/last-mrp', () => call(lastMrp.GET, makeReq('/api/medicines/x/last-mrp', { token: t() }), { id: A.medicine.id })],
    ['POST expiry-alerts/send', () => call(expirySend.POST, makeReq('/api/expiry-alerts/send', { method: 'POST', token: t(), body: {} }))],
    ['GET returns/medicines', () => call(returnsMedicines.GET, makeReq('/api/returns/medicines', { token: t() }))],
    ['GET medicines/export', () => call(medicinesExport.GET, makeReq('/api/medicines/export', { token: t() }))],
    ['GET inventory/export', () => call(inventoryExport.GET, makeReq('/api/inventory/export', { token: t() }))],
  ];

  for (const [name, run] of staffOnly) {
    it(`CASHIER → ${name} is 403`, async () => {
      expect((await run()).status).toBe(403);
    });
  }

  it('the POS still works for a cashier', async () => {
    const ok = (status: number) => status >= 200 && status < 300;
    expect(ok((await call(billingSearch.GET, makeReq('/api/billing/search?query=Med', { token: t() }))).status)).toBe(true);
    expect(ok((await call(inventoryBatches.GET, makeReq(`/api/inventory/batches?medicineId=${A.medicine.id}`, { token: t() }))).status)).toBe(true);
    expect(ok((await call(saleDetail.GET, makeReq('/api/sales/x', { token: t() }), { id: A.sale.id })).status)).toBe(true);
    expect(ok((await call(billingSettings.GET, makeReq('/api/settings/billing', { token: t() }))).status)).toBe(true);
    expect(ok((await call(dashboardAlerts.GET, makeReq('/api/dashboard/alerts', { token: t() }))).status)).toBe(true);
  });

  it('managers keep their back-office reads', async () => {
    const m = tokenFor(A.manager);
    expect((await call(customers.GET, makeReq('/api/customers', { token: m }))).status).toBe(200);
    expect((await call(purchases.GET, makeReq('/api/purchases', { token: m }))).status).toBe(200);
    expect((await call(credits.GET, makeReq('/api/credits', { token: m }))).status).toBe(200);
  });
});

describe('Low — cron secret and JWT hardening', () => {
  it('cron endpoint refuses missing or wrong secrets', async () => {
    process.env.CRON_SECRET = 'cron-secret-value-0123456789';
    try {
      expect((await call(cron.GET, makeReq('/api/cron/expiry-alerts'))).status).toBe(401);
      expect((await call(cron.GET, makeReq('/api/cron/expiry-alerts', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401);
      expect((await call(cron.GET, makeReq('/api/cron/expiry-alerts', { headers: { authorization: 'Bearer cron-secret-value-0123456789' } }))).status).toBe(200);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });

  it('the dashboard proxy fails closed on a bad token', async () => {
    const req = new NextRequest(new URL('/dashboard', 'https://shop.example.com'), { headers: { cookie: 'auth-token=garbage' } });
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
    expect(setCookie(res, 'auth-token')).toBe('');
  });
});
