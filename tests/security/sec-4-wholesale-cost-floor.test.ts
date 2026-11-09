/**
 * Finding #4 (Medium): WHOLESALE/TRANSFER sales defaulted to the batch's
 * purchaseRate when no price was sent, so any role (cashiers included) could
 * bill at cost without a price override, and TRANSFER was open to cashiers.
 *
 * Now: purchaseRate is never a sale price. Wholesale/transfer default to the
 * selling rate (no selling rate = refused), every wholesale/transfer price
 * must sit between cost and MRP for every role, TRANSFER is staff-only, and
 * the retail/wholesale enable flags are enforced. Cost (purchaseRate,
 * tradePrice) never reaches a cashier, wholesale path included.
 *
 * Seeded batch: MRP 100, selling 90, cost 60.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { call, makeReq, prisma, resetDb, seedShop, tokenFor, Seed } from '../helpers';
import * as sales from '@/app/api/sales/route';
import * as saleDetail from '@/app/api/sales/[id]/route';
import * as billingSearch from '@/app/api/billing/search/route';
import * as inventoryBatches from '@/app/api/inventory/batches/route';

let A: Seed;

beforeEach(async () => {
  await resetDb();
  A = await seedShop('A');
});

type Seller = Seed['admin'];
const sell = (user: Seller, saleType: string, rate: number, medicineId = A.medicine.id) =>
  call(
    sales.POST,
    makeReq('/api/sales', {
      method: 'POST',
      token: tokenFor(user),
      body: { saleType, paymentMode: 'CASH', items: [{ medicineId, quantity: 1, rate }] },
    })
  );

const billedRate = async (saleId: string) =>
  Number((await prisma.saleItem.findFirstOrThrow({ where: { saleId } })).rate);

describe('#4a cashier TRANSFER is refused', () => {
  it('cashier TRANSFER with rate 0 no longer bills at cost', async () => {
    const res = await sell(A.cashier, 'TRANSFER', 0);
    expect(res.status).toBe(400);
    expect(await prisma.sale.count({ where: { shopId: A.shop.id, saleType: 'TRANSFER' } })).toBe(0);
  });

  it('staff TRANSFER with rate 0 bills at the selling rate, not cost', async () => {
    const res = await sell(A.manager, 'TRANSFER', 0);
    expect(res.status).toBe(201);
    expect(await billedRate(res.json.data.id)).toBe(90);
  });
});

describe('#4b WHOLESALE rate 0 never resolves to purchaseRate', () => {
  for (const role of ['ADMIN', 'MANAGER', 'CASHIER'] as const) {
    it(`${role}: rate 0 → selling rate 90`, async () => {
      const user = { ADMIN: A.admin, MANAGER: A.manager, CASHIER: A.cashier }[role];
      const res = await sell(user, 'WHOLESALE', 0);
      expect(res.status).toBe(201);
      expect(await billedRate(res.json.data.id)).toBe(90);
    });
  }

  it('no selling rate → refused instead of falling back to cost', async () => {
    const med = await prisma.medicine.create({ data: { shopId: A.shop.id, name: 'NoSell', company: 'Co', category: 'General', hsn: '3004', gstPercent: 12 } });
    await prisma.inventoryBatch.create({
      data: {
        shopId: A.shop.id, medicineId: med.id, batchNumber: 'NS1', stockQty: 10, mrp: 100, sellingRate: 0, purchaseRate: 60,
        expiryDate: new Date(Date.UTC(new Date().getUTCFullYear() + 2, 0, 31)),
      },
    });
    const res = await sell(A.manager, 'WHOLESALE', 0, med.id);
    expect(res.status).toBe(400);
  });
});

describe('#4c wholesale price floor: cost <= rate <= MRP for every role', () => {
  it('below cost is refused, even for an admin', async () => {
    expect((await sell(A.admin, 'WHOLESALE', 50)).status).toBe(400);
    expect(await prisma.sale.count({ where: { shopId: A.shop.id, saleType: 'WHOLESALE' } })).toBe(0);
  });

  it('above MRP is refused', async () => {
    expect((await sell(A.admin, 'WHOLESALE', 120)).status).toBe(400);
  });

  it('between cost and MRP is billed as sent', async () => {
    const res = await sell(A.admin, 'WHOLESALE', 75);
    expect(res.status).toBe(201);
    expect(await billedRate(res.json.data.id)).toBe(75);
  });
});

describe('#4d cashier wholesale still works', () => {
  it('cashier WHOLESALE at a valid price succeeds', async () => {
    const res = await sell(A.cashier, 'WHOLESALE', 80);
    expect(res.status).toBe(201);
    expect(await billedRate(res.json.data.id)).toBe(80);
  });

  it('cashier WHOLESALE below cost is refused', async () => {
    expect((await sell(A.cashier, 'WHOLESALE', 55)).status).toBe(400);
  });
});

describe('#4 enable flags are enforced server-side', () => {
  it('WHOLESALE refused when wholesale is disabled; RETAIL refused when retail is disabled', async () => {
    await prisma.billingSettings.create({ data: { shopId: A.shop.id, enableWholesale: false, enableRetail: true } });
    expect((await sell(A.manager, 'WHOLESALE', 0)).status).toBe(400);
    await prisma.billingSettings.update({ where: { shopId: A.shop.id }, data: { enableWholesale: true, enableRetail: false } });
    expect((await sell(A.manager, 'RETAIL', 0)).status).toBe(400);
  });
});

describe('#4e no cost reaches a cashier on the wholesale path', () => {
  const hasCost = (json: unknown) => /"(purchaseRate|tradePrice)"/.test(JSON.stringify(json));

  it('billing search and batch list with saleType=WHOLESALE|TRANSFER carry no purchaseRate/tradePrice', async () => {
    for (const saleType of ['WHOLESALE', 'TRANSFER']) {
      const search = await call(billingSearch.GET, makeReq(`/api/billing/search?q=${encodeURIComponent(A.medicine.name)}&saleType=${saleType}`, { token: tokenFor(A.cashier) }));
      expect(search.status).toBe(200);
      expect(search.json.data.length).toBeGreaterThan(0);
      expect(hasCost(search.json), `search ${saleType}`).toBe(false);
      const batches = await call(inventoryBatches.GET, makeReq(`/api/inventory/batches?medicineId=${A.medicine.id}&saleType=${saleType}`, { token: tokenFor(A.cashier) }));
      expect(batches.status).toBe(200);
      expect(hasCost(batches.json), `batches ${saleType}`).toBe(false);
    }
  });

  it('sale details strip tradePrice as well as purchaseRate for a cashier', async () => {
    await prisma.medicine.update({ where: { id: A.medicine.id }, data: { tradePrice: 55 } });
    const res = await call(saleDetail.GET, makeReq(`/api/sales/${A.sale.id}`, { token: tokenFor(A.cashier) }), { id: A.sale.id });
    expect(res.status).toBe(200);
    expect(hasCost(res.json)).toBe(false);
  });
});
