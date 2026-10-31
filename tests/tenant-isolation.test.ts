/**
 * Multi-tenant isolation: an ADMIN of shop A (the most privileged shop role)
 * aims every id-taking endpoint at shop B's records. Nothing of shop B may
 * be returned, and nothing of shop B may change.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { call, makeReq, prisma, resetDb, seedShop, tokenFor, Seed } from './helpers';

import * as saleDetail from '@/app/api/sales/[id]/route';
import * as saleItems from '@/app/api/sales/[id]/items/route';
import * as purchaseDoc from '@/app/api/purchase-documents/[id]/route';
import * as purchaseHistoryItem from '@/app/api/purchase-history/[id]/route';
import * as purchaseItem from '@/app/api/purchases/[id]/route';
import * as supplierItem from '@/app/api/suppliers/[id]/route';
import * as supplierLedger from '@/app/api/suppliers/[id]/ledger/route';
import * as supplierPurchases from '@/app/api/suppliers/[id]/purchases/route';
import * as lastMrp from '@/app/api/medicines/[id]/last-mrp/route';
import * as medicineBatches from '@/app/api/inventory/medicine-batches/[medicineId]/route';
import * as batchDetails from '@/app/api/inventory/batch-details/route';
import * as importBatchJob from '@/app/api/medicines/import/batch/[id]/route';
import * as importStatus from '@/app/api/medicines/import/status/[jobId]/route';
import * as rackItem from '@/app/api/settings/rack-locations/[id]/route';
import * as userItem from '@/app/api/users/[id]/route';
import * as changePassword from '@/app/api/users/change-password/route';
import * as credits from '@/app/api/credits/route';
import * as customers from '@/app/api/customers/route';
import * as stockAdjustment from '@/app/api/stock-adjustment/route';
import * as inventoryUpdate from '@/app/api/inventory/update/route';
import * as medicineUpdate from '@/app/api/medicine/update/route';
import * as archiveBatch from '@/app/api/inventory/archive-batch/route';
import * as archivedBatches from '@/app/api/inventory/archived/route';
import * as archivedMedicines from '@/app/api/medicines/archived/route';
import * as bulkDelete from '@/app/api/medicines/bulk-delete/route';
import * as purchaseReturns from '@/app/api/purchases/returns/route';
import * as purchases from '@/app/api/purchases/route';
import * as inventoryBatches from '@/app/api/inventory/batches/route';
import * as returns from '@/app/api/returns/route';
import * as sales from '@/app/api/sales/route';

let A: Seed;
let B: Seed;
let bPurchaseId: string;
let bPdfJobId: string;
let bImportJobId: string;

beforeAll(async () => {
  await resetDb();
  A = await seedShop('A');
  B = await seedShop('B');
  const purchase = await prisma.purchase.create({
    data: { shopId: B.shop.id, supplierId: B.supplier.id, invoiceNumber: 'PB-1', invoiceDate: new Date(), totalAmount: 600 },
  });
  bPurchaseId = purchase.id;
  await prisma.purchaseItem.create({
    data: { purchaseId: purchase.id, medicineId: B.medicine.id, batchId: B.batch.id, quantity: 10, rate: 60, mrp: 100, amount: 600 } as any,
  }).catch(() => undefined);
  bPdfJobId = (await prisma.pdfImportJob.create({ data: { shopId: B.shop.id, userId: B.admin.id, fileName: 'b.pdf', pdfText: 'SECRET-B-TEXT' } })).id;
  bImportJobId = (await prisma.importJob.create({ data: { shopId: B.shop.id, medicines: '["SECRET-B-MED"]', status: 'done' } })).id;
});

/** Strings that would only appear if shop B data leaked. */
function leaked(json: unknown): string[] {
  const text = JSON.stringify(json);
  return [B.medicine.name, B.customer.name, B.customer.phone, B.batch.batchNumber, B.supplier.name, B.sale.invoiceNumber, B.admin.email, 'SECRET-B', 'PB-1']
    .filter((s) => text.includes(s));
}

const token = () => tokenFor(A.admin);

type Case = { name: string; run: () => Promise<{ status: number; json: unknown }> };

const reads: Case[] = [
  { name: 'GET /api/sales/[id]', run: () => call(saleDetail.GET, makeReq(`/api/sales/${B.sale.id}`, { token: token() }), { id: B.sale.id }) },
  { name: 'GET /api/sales/[id]/items', run: () => call(saleItems.GET, makeReq(`/api/sales/${B.sale.id}/items`, { token: token() }), { id: B.sale.id }) },
  { name: 'GET /api/purchase-documents/[id]', run: () => call(purchaseDoc.GET, makeReq(`/api/purchase-documents/${B.document.id}`, { token: token() }), { id: B.document.id }) },
  { name: 'GET /api/purchase-history/[id]', run: () => call(purchaseHistoryItem.GET, makeReq(`/api/purchase-history/${bPurchaseId}`, { token: token() }), { id: bPurchaseId }) },
  { name: 'GET /api/purchases/[id]', run: () => call(purchaseItem.GET, makeReq(`/api/purchases/${bPurchaseId}`, { token: token() }), { id: bPurchaseId }) },
  { name: 'GET /api/suppliers/[id]', run: () => call(supplierItem.GET, makeReq(`/api/suppliers/${B.supplier.id}`, { token: token() }), { id: B.supplier.id }) },
  { name: 'GET /api/suppliers/[id]/ledger', run: () => call(supplierLedger.GET, makeReq(`/api/suppliers/${B.supplier.id}/ledger`, { token: token() }), { id: B.supplier.id }) },
  { name: 'GET /api/suppliers/[id]/purchases', run: () => call(supplierPurchases.GET, makeReq(`/api/suppliers/${B.supplier.id}/purchases`, { token: token() }), { id: B.supplier.id }) },
  { name: 'GET /api/medicines/[id]/last-mrp', run: () => call(lastMrp.GET, makeReq(`/api/medicines/${B.medicine.id}/last-mrp`, { token: token() }), { id: B.medicine.id }) },
  { name: 'GET /api/inventory/medicine-batches/[medicineId]', run: () => call(medicineBatches.GET, makeReq(`/api/inventory/medicine-batches/${B.medicine.id}`, { token: token() }), { medicineId: B.medicine.id }) },
  { name: 'GET /api/inventory/batch-details', run: () => call(batchDetails.GET, makeReq(`/api/inventory/batch-details?batchId=${B.batch.id}`, { token: token() })) },
  { name: 'GET /api/medicines/import/batch/[id]', run: () => call(importBatchJob.GET, makeReq(`/api/medicines/import/batch/${bPdfJobId}`, { token: token() }), { id: bPdfJobId }) },
  { name: 'GET /api/medicines/import/status/[jobId]', run: () => call(importStatus.GET, makeReq(`/api/medicines/import/status/${bImportJobId}`, { token: token() }), { jobId: bImportJobId }) },
  { name: 'GET /api/purchases?supplierId=B', run: () => call(purchases.GET, makeReq(`/api/purchases?supplierId=${B.supplier.id}`, { token: token() })) },
  { name: 'GET /api/customers', run: () => call(customers.GET, makeReq('/api/customers', { token: token() })) },
  { name: 'GET /api/credits', run: () => call(credits.GET, makeReq('/api/credits', { token: token() })) },
];

describe('cross-shop reads return nothing of shop B', () => {
  for (const c of reads) {
    it(c.name, async () => {
      const res = await c.run();
      expect(leaked(res.json), `${c.name} → ${res.status}`).toEqual([]);
    });
  }
});

/** Snapshot of every shop B row a write could touch. */
async function snapshotB() {
  const [shop, users, medicines, batches, customers, suppliers, sales, racks, purchases, returnsCount] = await Promise.all([
    prisma.shop.findUnique({ where: { id: B.shop.id } }),
    prisma.user.findMany({ where: { shopId: B.shop.id }, orderBy: { id: 'asc' } }),
    prisma.medicine.findMany({ where: { shopId: B.shop.id }, orderBy: { id: 'asc' } }),
    prisma.inventoryBatch.findMany({ where: { shopId: B.shop.id }, orderBy: { id: 'asc' } }),
    prisma.customer.findMany({ where: { shopId: B.shop.id }, orderBy: { id: 'asc' } }),
    prisma.supplier.findMany({ where: { shopId: B.shop.id }, orderBy: { id: 'asc' } }),
    prisma.sale.findMany({ where: { shopId: B.shop.id }, orderBy: { id: 'asc' } }),
    prisma.rackLocation.findMany({ where: { shopId: B.shop.id }, orderBy: { id: 'asc' } }),
    prisma.purchase.findMany({ where: { shopId: B.shop.id }, orderBy: { id: 'asc' } }),
    prisma.medicineReturn.count({ where: { OR: [{ shopId: B.shop.id }, { saleItemId: B.saleItem.id }, { batchId: B.batch.id }] } }),
  ]);
  return JSON.stringify({ shop, users, medicines, batches, customers, suppliers, sales, racks, purchases, returnsCount });
}

const json = (method: string, path: string, body?: unknown) => makeReq(path, { method, token: token(), body });

const writes: Case[] = [
  { name: 'PUT /api/suppliers/[id]', run: () => call(supplierItem.PUT, json('PUT', `/api/suppliers/${B.supplier.id}`, { name: 'Hacked', phone: '1234567890', address: 'Hacked addr' }), { id: B.supplier.id }) },
  { name: 'DELETE /api/suppliers/[id]', run: () => call(supplierItem.DELETE, json('DELETE', `/api/suppliers/${B.supplier.id}`), { id: B.supplier.id }) },
  { name: 'PUT /api/settings/rack-locations/[id]', run: () => call(rackItem.PUT, json('PUT', `/api/settings/rack-locations/${B.rack.id}`, { name: 'Hacked' }), { id: B.rack.id }) },
  { name: 'DELETE /api/settings/rack-locations/[id]', run: () => call(rackItem.DELETE, json('DELETE', `/api/settings/rack-locations/${B.rack.id}`), { id: B.rack.id }) },
  { name: 'PUT /api/users/[id]', run: () => call(userItem.PUT, json('PUT', `/api/users/${B.cashier.id}`, { name: 'Hacked', role: 'ADMIN' }), { id: B.cashier.id }) },
  { name: 'DELETE /api/users/[id]', run: () => call(userItem.DELETE, json('DELETE', `/api/users/${B.cashier.id}`), { id: B.cashier.id }) },
  { name: 'POST /api/users/change-password', run: () => call(changePassword.POST, json('POST', '/api/users/change-password', { userId: B.admin.id, newPassword: 'pwned-password' })) },
  { name: 'PATCH /api/credits', run: () => call(credits.PATCH, json('PATCH', '/api/credits', { saleId: B.sale.id, amount: 180 })) },
  { name: 'PATCH /api/customers', run: () => call(customers.PATCH, json('PATCH', '/api/customers', { id: B.customer.id, name: 'Hacked' })) },
  { name: 'POST /api/stock-adjustment', run: () => call(stockAdjustment.POST, json('POST', '/api/stock-adjustment', { batchId: B.batch.id, type: 'REMOVE', quantity: 10, reason: 'DAMAGED' })) },
  { name: 'PUT /api/inventory/update', run: () => call(inventoryUpdate.PUT, json('PUT', '/api/inventory/update', { id: B.batch.id, stockQty: 0, mrp: 1 })) },
  { name: 'DELETE /api/inventory/update', run: () => call(inventoryUpdate.DELETE, json('DELETE', `/api/inventory/update?id=${B.batch.id}`)) },
  { name: 'PUT /api/medicine/update', run: () => call(medicineUpdate.PUT, json('PUT', '/api/medicine/update', { id: B.medicine.id, name: 'Hacked' })) },
  { name: 'DELETE /api/medicine/update', run: () => call(medicineUpdate.DELETE, json('DELETE', `/api/medicine/update?id=${B.medicine.id}`)) },
  { name: 'POST /api/inventory/archive-batch', run: () => call(archiveBatch.POST, json('POST', '/api/inventory/archive-batch', { batchId: B.batch.id, reason: 'Expired stock' })) },
  { name: 'POST /api/inventory/archived (restore)', run: () => call(archivedBatches.POST, json('POST', '/api/inventory/archived', { id: B.batch.id })) },
  { name: 'POST /api/medicines/archived (restore)', run: () => call(archivedMedicines.POST, json('POST', '/api/medicines/archived', { id: B.medicine.id })) },
  { name: 'POST /api/medicines/bulk-delete', run: () => call(bulkDelete.POST, json('POST', '/api/medicines/bulk-delete', { ids: [B.medicine.id] })) },
  { name: 'POST /api/purchases/returns', run: () => call(purchaseReturns.POST, json('POST', '/api/purchases/returns', { purchaseId: bPurchaseId, medicineId: B.medicine.id, batchId: B.batch.id, quantity: 1, reason: 'Damaged' })) },
  { name: 'POST /api/purchases (B supplier)', run: () => call(purchases.POST, json('POST', '/api/purchases', { supplierId: B.supplier.id, invoiceNumber: 'X', invoiceDate: new Date().toISOString(), items: [{ medicineId: A.medicine.id, batchNumber: 'Z', expiryDate: '2030-01-31', quantity: 1, purchaseRate: 1, mrp: 2 }] })) },
  { name: 'POST /api/inventory/batches (B medicine)', run: () => call(inventoryBatches.POST, json('POST', '/api/inventory/batches', { medicineId: B.medicine.id, batchNumber: 'EVIL', expiryDate: '2030-01-31', stockQty: 5, mrp: 10, sellingRate: 10 })) },
  { name: 'POST /api/returns (B sale item)', run: () => call(returns.POST, json('POST', '/api/returns', { type: 'CUSTOMER', saleItemId: B.saleItem.id, quantity: 1, reason: 'Damaged pack' })) },
  { name: 'POST /api/returns (B batch, supplier)', run: () => call(returns.POST, json('POST', '/api/returns', { type: 'SUPPLIER', medicineId: B.medicine.id, batchId: B.batch.id, expiryDate: B.batch.expiryDate, mrp: 100, quantity: 1, reason: 'Damaged pack' })) },
  { name: 'POST /api/sales (B batch)', run: () => call(sales.POST, json('POST', '/api/sales', { saleType: 'RETAIL', paymentMode: 'CASH', items: [{ medicineId: B.medicine.id, batchId: B.batch.id, quantity: 1, rate: 0, discount: 0 }] })) },
  { name: 'POST /api/sales (B medicine, no batch)', run: () => call(sales.POST, json('POST', '/api/sales', { saleType: 'RETAIL', paymentMode: 'CASH', items: [{ medicineId: B.medicine.id, quantity: 1, rate: 0, discount: 0 }] })) },
];

describe('cross-shop writes are refused and change nothing in shop B', () => {
  for (const c of writes) {
    it(c.name, async () => {
      const before = await snapshotB();
      const res = await c.run();
      expect([400, 403, 404], `${c.name} → ${res.status} ${JSON.stringify(res.json).slice(0, 200)}`).toContain(res.status);
      expect(leaked(res.json)).toEqual([]);
      expect(await snapshotB()).toBe(before);
    });
  }
});

describe('mass assignment', () => {
  it('a supplier update cannot move the supplier into another shop or change its id', async () => {
    const res = await call(
      supplierItem.PUT,
      makeReq(`/api/suppliers/${A.supplier.id}`, {
        method: 'PUT',
        token: tokenFor(A.manager),
        body: { name: 'Renamed', shopId: B.shop.id, id: 'forged-id', createdAt: '2000-01-01' },
      }),
      { id: A.supplier.id }
    );
    expect(res.status).toBe(200);
    const row = await prisma.supplier.findUniqueOrThrow({ where: { id: A.supplier.id } });
    expect(row.shopId).toBe(A.shop.id);
    expect(row.name).toBe('Renamed');
    expect(row.createdAt.getFullYear()).not.toBe(2000);
  });
});
