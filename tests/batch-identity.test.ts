/**
 * Batch identity = medicine + batch number + expiry + MRP + packing. The same
 * batch number and expiry with a different MRP or packing is a new batch.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { call, makeReq, prisma, resetDb, seedShop, tokenFor, Seed } from './helpers';
import { findBatchByIdentity } from '@/services/inventory';
import * as inventoryBatches from '@/app/api/inventory/batches/route';
import * as inventoryUpdate from '@/app/api/inventory/update/route';

let A: Seed;

beforeEach(async () => {
  await resetDb();
  A = await seedShop('A');
});

// Seeded batch: number BA, MRP 100, packing ''.
function addBatch(body: Record<string, unknown>) {
  return call(
    inventoryBatches.POST,
    makeReq('/api/inventory/batches', {
      method: 'POST',
      token: tokenFor(A.admin),
      body: {
        medicineId: A.medicine.id,
        batchNumber: A.batch.batchNumber,
        expiryDate: A.batch.expiryDate.toISOString(),
        stockQty: 5,
        mrp: 100,
        sellingRate: 100,
        ...body,
      },
    })
  );
}

const batchesOf = () =>
  prisma.inventoryBatch.findMany({ where: { medicineId: A.medicine.id }, orderBy: { createdAt: 'asc' } });

describe('manual add batch identity', () => {
  it('adds to the existing batch when MRP and packing match', async () => {
    const res = await addBatch({});
    expect(res.status).toBe(201);
    expect(res.json.data.id).toBe(A.batch.id);
    const batches = await batchesOf();
    expect(batches).toHaveLength(1);
    expect(batches[0].stockQty).toBe(55);
  });

  it('creates a separate batch when only the MRP differs', async () => {
    const res = await addBatch({ mrp: 120, sellingRate: 120 });
    expect(res.status).toBe(201);
    expect(res.json.data.id).not.toBe(A.batch.id);
    const batches = await batchesOf();
    expect(batches.map((b) => [Number(b.mrp), b.stockQty])).toEqual([[100, 50], [120, 5]]);
  });

  it('creates a separate batch when only the packing differs, and matches it ignoring extra spaces', async () => {
    const first = await addBatch({ packing: '10 Tab' });
    expect(first.status).toBe(201);
    expect(first.json.data.id).not.toBe(A.batch.id);

    const again = await addBatch({ packing: '  10   Tab ' });
    expect(again.json.data.id).toBe(first.json.data.id);

    const batches = await batchesOf();
    expect(batches.map((b) => [b.packing, b.stockQty])).toEqual([['', 50], ['10 Tab', 10]]);
  });

  it('treats 100 and 100.00 as the same MRP', async () => {
    const res = await addBatch({ mrp: 100.0 });
    expect(res.json.data.id).toBe(A.batch.id);
  });
});

describe('lookups without packing', () => {
  it('match the oldest batch with the same MRP, whatever its packing', async () => {
    await addBatch({ packing: '10 Tab' });
    const found = await findBatchByIdentity(prisma, {
      shopId: A.shop.id,
      medicineId: A.medicine.id,
      batchNumber: A.batch.batchNumber,
      expiryDate: A.batch.expiryDate,
      mrp: 100,
    });
    expect(found?.id).toBe(A.batch.id);
  });
});

describe('batch edit', () => {
  it('refuses an MRP/packing edit that collides with another batch', async () => {
    const other = await addBatch({ mrp: 120, sellingRate: 120 });
    const res = await call(
      inventoryUpdate.PUT,
      makeReq('/api/inventory/update', {
        method: 'PUT',
        token: tokenFor(A.admin),
        body: {
          id: other.json.data.id,
          batchNumber: A.batch.batchNumber,
          expiryDate: A.batch.expiryDate.toISOString(),
          stockQty: 5,
          purchaseRate: 60,
          mrp: 100,
          packing: '',
        },
      })
    );
    expect(res.status).toBe(409);
  });
});
