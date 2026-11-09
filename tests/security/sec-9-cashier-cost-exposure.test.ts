/**
 * Finding #9 (Low): cashiers could read cost prices (purchaseRate) through
 * sale details, the sale response, inventory batches, billing search and
 * dashboard alerts, and list every sale with customer phones via GET
 * /api/sales. Cost now reaches a cashier only on the wholesale/transfer
 * pricing path (?saleType=WHOLESALE|TRANSFER), and the sales list is
 * staff-only.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { call, makeReq, prisma, resetDb, seedShop, tokenFor, Seed } from '../helpers';
import * as sales from '@/app/api/sales/route';
import * as saleDetail from '@/app/api/sales/[id]/route';
import * as inventoryBatches from '@/app/api/inventory/batches/route';
import * as billingSearch from '@/app/api/billing/search/route';
import * as dashboardAlerts from '@/app/api/dashboard/alerts/route';

let A: Seed;

beforeEach(async () => {
  await resetDb();
  A = await seedShop('A');
});

const asCashier = (path: string, opts: { method?: string; body?: unknown } = {}) => makeReq(path, { ...opts, token: tokenFor(A.cashier) });
const hasCost = (json: unknown) => JSON.stringify(json).includes('"purchaseRate"');

describe('#9 cashier cannot read cost prices', () => {
  it('GET /api/sales/[id] hides purchaseRate from a cashier', async () => {
    const res = await call(saleDetail.GET, asCashier(`/api/sales/${A.sale.id}`), { id: A.sale.id });
    expect(res.status).toBe(200);
    expect(hasCost(res.json)).toBe(false);
  });

  it('POST /api/sales response hides purchaseRate from a cashier', async () => {
    const res = await call(
      sales.POST,
      asCashier('/api/sales', {
        method: 'POST',
        body: { saleType: 'RETAIL', paymentMode: 'CASH', items: [{ medicineId: A.medicine.id, quantity: 1, rate: 0 }] },
      })
    );
    expect(res.status).toBe(201);
    expect(hasCost(res.json)).toBe(false);
  });

  it('GET /api/inventory/batches hides purchaseRate (list and per-medicine)', async () => {
    const list = await call(inventoryBatches.GET, asCashier('/api/inventory/batches'));
    expect(list.status).toBe(200);
    expect(hasCost(list.json)).toBe(false);
    const forMedicine = await call(inventoryBatches.GET, asCashier(`/api/inventory/batches?medicineId=${A.medicine.id}`));
    expect(hasCost(forMedicine.json)).toBe(false);
  });

  it('GET /api/billing/search hides purchaseRate on the retail path', async () => {
    const res = await call(billingSearch.GET, asCashier(`/api/billing/search?q=${encodeURIComponent(A.medicine.name)}`));
    expect(res.status).toBe(200);
    expect(res.json.data.length).toBeGreaterThan(0);
    expect(hasCost(res.json)).toBe(false);
  });

  it('GET /api/dashboard/alerts hides purchaseRate', async () => {
    await prisma.inventoryBatch.create({
      data: {
        shopId: A.shop.id, medicineId: A.medicine.id, batchNumber: 'SOON', stockQty: 3, mrp: 100, sellingRate: 90, purchaseRate: 60,
        expiryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      },
    });
    const res = await call(dashboardAlerts.GET, asCashier('/api/dashboard/alerts'));
    expect(res.status).toBe(200);
    expect(res.json.expiryAlerts.length).toBeGreaterThan(0);
    expect(hasCost(res.json)).toBe(false);
  });

  it('GET /api/sales (all sales + customer phones) is staff-only', async () => {
    const res = await call(sales.GET, asCashier('/api/sales'));
    expect(res.status).toBe(403);
  });
});

describe('#9 cost still reaches the wholesale path and staff', () => {
  it('cashier gets purchaseRate when pricing a wholesale/transfer sale', async () => {
    const search = await call(billingSearch.GET, asCashier(`/api/billing/search?q=${encodeURIComponent(A.medicine.name)}&saleType=WHOLESALE`));
    expect(hasCost(search.json)).toBe(true);
    const batches = await call(inventoryBatches.GET, asCashier(`/api/inventory/batches?medicineId=${A.medicine.id}&saleType=TRANSFER`));
    expect(hasCost(batches.json)).toBe(true);
  });

  it('a manager still sees purchaseRate', async () => {
    const res = await call(saleDetail.GET, makeReq(`/api/sales/${A.sale.id}`, { token: tokenFor(A.manager) }), { id: A.sale.id });
    expect(hasCost(res.json)).toBe(true);
  });
});
