/**
 * Purchase rows carry free-text packing (like Add Inventory) instead of
 * pack type x units per pack. Packing is saved on the batch and is part of
 * the batch identity; a blank packing matches any existing batch.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { call, makeReq, prisma, resetDb, seedShop, tokenFor, Seed } from './helpers';
import * as purchases from '@/app/api/purchases/route';

let A: Seed;
let invoiceSeq = 0;

beforeEach(async () => {
  await resetDb();
  A = await seedShop('A');
});

const expiry = `${new Date().getUTCFullYear() + 2}-06-30`;

const buy = (item: Record<string, unknown>) =>
  call(
    purchases.POST,
    makeReq('/api/purchases', {
      method: 'POST',
      token: tokenFor(A.manager),
      body: {
        supplierId: A.supplier.id,
        invoiceNumber: `PK-${++invoiceSeq}`,
        invoiceDate: new Date().toISOString().slice(0, 10),
        items: [{ medicineId: A.medicine.id, batchNumber: 'PK1', expiryDate: expiry, quantity: 10, purchaseRate: 40, mrp: 100, ...item }],
      },
    })
  );

const pk1 = () => prisma.inventoryBatch.findMany({ where: { shopId: A.shop.id, batchNumber: 'PK1' }, orderBy: { createdAt: 'asc' } });

describe('purchase packing (free text, saved on the batch)', () => {
  it('saves the packing on a new batch; qty and rate are per unit', async () => {
    const res = await buy({ packing: '  10x10   Strips ' });
    expect(res.status).toBe(200);
    const [batch] = await pk1();
    expect(batch.packing).toBe('10x10 Strips');
    expect(batch.stockQty).toBe(10);
    expect(Number(batch.purchaseRate)).toBe(40);
  });

  it('same packing adds to the batch; different packing is a separate batch; blank matches any', async () => {
    expect((await buy({ packing: '100ml' })).status).toBe(200);
    expect((await buy({ packing: '100ml' })).status).toBe(200);
    expect((await buy({ packing: '200ml' })).status).toBe(200);
    expect((await buy({})).status).toBe(200);
    const batches = await pk1();
    expect(batches.map((b) => [b.packing, b.stockQty])).toEqual([
      ['100ml', 30],
      ['200ml', 10],
    ]);
  });
});
