/**
 * Role matrix: every role-restricted endpoint is called directly (no UI) by
 * each role that must not use it. Each must answer 403 (404 for super-admin
 * endpoints, which hide themselves) and must not change any data.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { call, makeReq, prisma, resetDb, seedShop, tokenFor, Seed } from './helpers';

import * as activityLog from '@/app/api/admin/activity-log/route';
import * as dbStats from '@/app/api/admin/db-stats/route';
import * as loginHistory from '@/app/api/admin/login-history/route';
import * as aiKeys from '@/app/api/admin/ai-keys/route';
import * as aiKeyFeatures from '@/app/api/admin/ai-keys/features/route';
import * as aiKeyInstances from '@/app/api/admin/ai-keys/instances/route';
import * as aiKeyOrder from '@/app/api/admin/ai-keys/order/route';
import * as aiKeyTest from '@/app/api/admin/ai-keys/test/route';
import * as aiUsage from '@/app/api/admin/ai-usage/route';
import * as backup from '@/app/api/database/backup/route';
import * as restore from '@/app/api/database/restore/route';
import * as byCompany from '@/app/api/medicines/by-company/route';
import * as clearAll from '@/app/api/medicines/clear-all/route';
import * as gstCategories from '@/app/api/settings/gst-categories/route';
import * as importCsv from '@/app/api/settings/import-csv/route';
import * as inventorySettings from '@/app/api/settings/inventory/route';
import * as racks from '@/app/api/settings/rack-locations/route';
import * as rackItem from '@/app/api/settings/rack-locations/[id]/route';
import * as supplierItem from '@/app/api/suppliers/[id]/route';
import * as suppliers from '@/app/api/suppliers/route';
import * as users from '@/app/api/users/route';
import * as userItem from '@/app/api/users/[id]/route';
import * as changePassword from '@/app/api/users/change-password/route';
import * as posDevices from '@/app/api/pos-devices/route';
import * as posDeviceItem from '@/app/api/pos-devices/[id]/route';
import * as archiveBatch from '@/app/api/inventory/archive-batch/route';
import * as archivedBatches from '@/app/api/inventory/archived/route';
import * as inventoryBatches from '@/app/api/inventory/batches/route';
import * as inventoryHistory from '@/app/api/inventory-history/route';
import * as inventoryMove from '@/app/api/inventory/move/route';
import * as reconcile from '@/app/api/inventory/reconcile/route';
import * as inventoryUpdate from '@/app/api/inventory/update/route';
import * as bulkImport from '@/app/api/medicine/bulk-import/route';
import * as archivedMedicines from '@/app/api/medicines/archived/route';
import * as bulkDelete from '@/app/api/medicines/bulk-delete/route';
import * as bulkInsert from '@/app/api/medicines/bulk-insert/route';
import * as importSingle from '@/app/api/medicines/import/single/route';
import * as medicineSearch from '@/app/api/medicines/search/route';
import * as medicineUpdate from '@/app/api/medicine/update/route';
import * as purchaseDoc from '@/app/api/purchase-documents/[id]/route';
import * as purchaseHistory from '@/app/api/purchase-history/route';
import * as purchaseHistoryItem from '@/app/api/purchase-history/[id]/route';
import * as purchases from '@/app/api/purchases/route';
import * as purchaseReturns from '@/app/api/purchases/returns/route';
import * as scanInvoice from '@/app/api/purchases/scan-invoice/route';
import * as returns from '@/app/api/returns/route';
import * as billingSettings from '@/app/api/settings/billing/route';
import * as expirySettings from '@/app/api/settings/expiry-alerts/route';
import * as invoiceSettings from '@/app/api/settings/invoice/route';
import * as settings from '@/app/api/settings/route';
import * as shopSettings from '@/app/api/settings/shop/route';
import * as stockAdjustment from '@/app/api/stock-adjustment/route';
import * as stockAdjustmentBatches from '@/app/api/stock-adjustment/batches/route';
import * as medicineImport from '@/app/api/medicines/import/route';
import * as priceListImport from '@/app/api/medicine/import-price-list/route';
import * as importBatchJob from '@/app/api/medicines/import/batch/[id]/route';

type Role = 'ADMIN' | 'MANAGER' | 'CASHIER';
type Route = {
  name: string;
  handler: unknown;
  method: string;
  path: string;
  body?: unknown;
  params?: () => Record<string, string>;
  /** Roles that may use it. Everyone else must be refused. */
  allowed: Role[] | 'SUPER_ADMIN';
};

let S: Seed;

beforeAll(async () => {
  await resetDb();
  delete process.env.SUPER_ADMIN_USER_IDS;
  S = await seedShop('A');
});

const ADMIN: Role[] = ['ADMIN'];
const STAFF: Role[] = ['ADMIN', 'MANAGER'];

const routes: Route[] = [
  // Admin only
  { name: 'GET admin/activity-log', handler: activityLog.GET, method: 'GET', path: '/api/admin/activity-log', allowed: ADMIN },
  { name: 'GET admin/db-stats', handler: dbStats.GET, method: 'GET', path: '/api/admin/db-stats', allowed: ADMIN },
  { name: 'GET admin/login-history', handler: loginHistory.GET, method: 'GET', path: '/api/admin/login-history', allowed: ADMIN },
  { name: 'GET database/backup', handler: backup.GET, method: 'GET', path: '/api/database/backup', allowed: ADMIN },
  { name: 'POST database/restore', handler: restore.POST, method: 'POST', path: '/api/database/restore', body: { meta: {}, data: { companies: [{ name: 'X' }] } }, allowed: ADMIN },
  { name: 'DELETE medicines/by-company', handler: byCompany.DELETE, method: 'DELETE', path: '/api/medicines/by-company?company=Co', allowed: ADMIN },
  { name: 'DELETE medicines/clear-all', handler: clearAll.DELETE, method: 'DELETE', path: '/api/medicines/clear-all', allowed: ADMIN },
  { name: 'PUT settings/gst-categories', handler: gstCategories.PUT, method: 'PUT', path: '/api/settings/gst-categories', body: { categories: [] }, allowed: ADMIN },
  { name: 'POST settings/import-csv', handler: importCsv.POST, method: 'POST', path: '/api/settings/import-csv', body: { csv: 'a' }, allowed: ADMIN },
  { name: 'PATCH settings/inventory', handler: inventorySettings.PATCH, method: 'PATCH', path: '/api/settings/inventory', body: { lowStockThreshold: 1 }, allowed: ADMIN },
  { name: 'POST settings/rack-locations', handler: racks.POST, method: 'POST', path: '/api/settings/rack-locations', body: { name: 'NEW' }, allowed: ADMIN },
  { name: 'PUT settings/rack-locations/[id]', handler: rackItem.PUT, method: 'PUT', path: '/api/settings/rack-locations/x', body: { name: 'Z' }, params: () => ({ id: S.rack.id }), allowed: ADMIN },
  { name: 'DELETE settings/rack-locations/[id]', handler: rackItem.DELETE, method: 'DELETE', path: '/api/settings/rack-locations/x', params: () => ({ id: S.rack.id }), allowed: ADMIN },
  { name: 'DELETE suppliers/[id]', handler: supplierItem.DELETE, method: 'DELETE', path: '/api/suppliers/x', params: () => ({ id: S.supplier.id }), allowed: ADMIN },
  { name: 'GET users', handler: users.GET, method: 'GET', path: '/api/users', allowed: ADMIN },
  { name: 'POST users', handler: users.POST, method: 'POST', path: '/api/users', body: { name: 'Evil', email: 'evil@x.dev', password: 'longpassword', role: 'ADMIN' }, allowed: ADMIN },
  { name: 'PUT users/[id] (self → ADMIN)', handler: userItem.PUT, method: 'PUT', path: '/api/users/x', body: { role: 'ADMIN' }, params: () => ({ id: S.cashier.id }), allowed: ADMIN },
  { name: 'DELETE users/[id]', handler: userItem.DELETE, method: 'DELETE', path: '/api/users/x', params: () => ({ id: S.cashier.id }), allowed: ADMIN },
  { name: 'POST users/change-password', handler: changePassword.POST, method: 'POST', path: '/api/users/change-password', body: {}, allowed: ADMIN },
  { name: 'GET pos-devices', handler: posDevices.GET, method: 'GET', path: '/api/pos-devices', allowed: ADMIN },
  { name: 'POST pos-devices', handler: posDevices.POST, method: 'POST', path: '/api/pos-devices', body: { name: 'x' }, allowed: ADMIN },
  { name: 'DELETE pos-devices/[id]', handler: posDeviceItem.DELETE, method: 'DELETE', path: '/api/pos-devices/x', params: () => ({ id: 'x' }), allowed: ADMIN },

  // Super-admin only (404 for everyone else)
  { name: 'GET admin/ai-keys', handler: aiKeys.GET, method: 'GET', path: '/api/admin/ai-keys', allowed: 'SUPER_ADMIN' },
  { name: 'POST admin/ai-keys', handler: aiKeys.POST, method: 'POST', path: '/api/admin/ai-keys', body: {}, allowed: 'SUPER_ADMIN' },
  { name: 'PATCH admin/ai-keys', handler: aiKeys.PATCH, method: 'PATCH', path: '/api/admin/ai-keys', body: {}, allowed: 'SUPER_ADMIN' },
  { name: 'DELETE admin/ai-keys', handler: aiKeys.DELETE, method: 'DELETE', path: '/api/admin/ai-keys', body: {}, allowed: 'SUPER_ADMIN' },
  { name: 'PUT admin/ai-keys/features', handler: aiKeyFeatures.PUT, method: 'PUT', path: '/api/admin/ai-keys/features', body: {}, allowed: 'SUPER_ADMIN' },
  { name: 'POST admin/ai-keys/instances', handler: aiKeyInstances.POST, method: 'POST', path: '/api/admin/ai-keys/instances', body: {}, allowed: 'SUPER_ADMIN' },
  { name: 'DELETE admin/ai-keys/instances', handler: aiKeyInstances.DELETE, method: 'DELETE', path: '/api/admin/ai-keys/instances', body: {}, allowed: 'SUPER_ADMIN' },
  { name: 'PUT admin/ai-keys/order', handler: aiKeyOrder.PUT, method: 'PUT', path: '/api/admin/ai-keys/order', body: { ids: [] }, allowed: 'SUPER_ADMIN' },
  { name: 'POST admin/ai-keys/test', handler: aiKeyTest.POST, method: 'POST', path: '/api/admin/ai-keys/test', body: {}, allowed: 'SUPER_ADMIN' },
  { name: 'GET admin/ai-usage', handler: aiUsage.GET, method: 'GET', path: '/api/admin/ai-usage', allowed: 'SUPER_ADMIN' },

  // Admin + manager
  { name: 'POST inventory/archive-batch', handler: archiveBatch.POST, method: 'POST', path: '/api/inventory/archive-batch', body: { batchId: 'x', reason: 'r' }, allowed: STAFF },
  { name: 'POST inventory/archived', handler: archivedBatches.POST, method: 'POST', path: '/api/inventory/archived', body: { id: 'x' }, allowed: STAFF },
  { name: 'POST inventory/batches', handler: inventoryBatches.POST, method: 'POST', path: '/api/inventory/batches', body: {}, allowed: STAFF },
  { name: 'GET inventory-history', handler: inventoryHistory.GET, method: 'GET', path: '/api/inventory-history', allowed: STAFF },
  { name: 'POST inventory/move', handler: inventoryMove.POST, method: 'POST', path: '/api/inventory/move', body: { items: [] }, allowed: STAFF },
  { name: 'POST inventory/reconcile', handler: reconcile.POST, method: 'POST', path: '/api/inventory/reconcile', body: {}, allowed: STAFF },
  { name: 'PUT inventory/update', handler: inventoryUpdate.PUT, method: 'PUT', path: '/api/inventory/update', body: { id: 'x' }, allowed: STAFF },
  { name: 'DELETE inventory/update', handler: inventoryUpdate.DELETE, method: 'DELETE', path: '/api/inventory/update?id=x', allowed: STAFF },
  { name: 'POST medicine/bulk-import', handler: bulkImport.POST, method: 'POST', path: '/api/medicine/bulk-import', body: { medicines: [] }, allowed: STAFF },
  { name: 'POST medicines/archived', handler: archivedMedicines.POST, method: 'POST', path: '/api/medicines/archived', body: { id: 'x' }, allowed: STAFF },
  { name: 'POST medicines/bulk-delete', handler: bulkDelete.POST, method: 'POST', path: '/api/medicines/bulk-delete', body: { ids: ['x'] }, allowed: STAFF },
  { name: 'POST medicines/bulk-insert', handler: bulkInsert.POST, method: 'POST', path: '/api/medicines/bulk-insert', body: { medicines: [] }, allowed: STAFF },
  { name: 'POST medicines/import/single', handler: importSingle.POST, method: 'POST', path: '/api/medicines/import/single', body: {}, allowed: STAFF },
  { name: 'POST medicines/search', handler: medicineSearch.POST, method: 'POST', path: '/api/medicines/search', body: {}, allowed: STAFF },
  { name: 'PUT medicine/update', handler: medicineUpdate.PUT, method: 'PUT', path: '/api/medicine/update', body: { id: 'x' }, allowed: STAFF },
  { name: 'DELETE medicine/update', handler: medicineUpdate.DELETE, method: 'DELETE', path: '/api/medicine/update?id=x', allowed: STAFF },
  { name: 'GET purchase-documents/[id]', handler: purchaseDoc.GET, method: 'GET', path: '/api/purchase-documents/x', params: () => ({ id: S.document.id }), allowed: STAFF },
  { name: 'GET purchase-history', handler: purchaseHistory.GET, method: 'GET', path: '/api/purchase-history', allowed: STAFF },
  { name: 'GET purchase-history/[id]', handler: purchaseHistoryItem.GET, method: 'GET', path: '/api/purchase-history/x', params: () => ({ id: 'x' }), allowed: STAFF },
  { name: 'POST purchases', handler: purchases.POST, method: 'POST', path: '/api/purchases', body: {}, allowed: STAFF },
  { name: 'POST purchases/returns', handler: purchaseReturns.POST, method: 'POST', path: '/api/purchases/returns', body: {}, allowed: STAFF },
  { name: 'POST purchases/scan-invoice', handler: scanInvoice.POST, method: 'POST', path: '/api/purchases/scan-invoice', body: {}, allowed: STAFF },
  { name: 'GET returns', handler: returns.GET, method: 'GET', path: '/api/returns', allowed: STAFF },
  { name: 'POST returns', handler: returns.POST, method: 'POST', path: '/api/returns', body: { type: 'CUSTOMER', saleItemId: 'x', quantity: 1, reason: 'r' }, allowed: STAFF },
  { name: 'PATCH settings/billing', handler: billingSettings.PATCH, method: 'PATCH', path: '/api/settings/billing', body: {}, allowed: STAFF },
  { name: 'PATCH settings/expiry-alerts', handler: expirySettings.PATCH, method: 'PATCH', path: '/api/settings/expiry-alerts', body: {}, allowed: STAFF },
  { name: 'PUT settings/invoice', handler: invoiceSettings.PUT, method: 'PUT', path: '/api/settings/invoice', body: {}, allowed: STAFF },
  { name: 'PATCH settings', handler: settings.PATCH, method: 'PATCH', path: '/api/settings', body: {}, allowed: STAFF },
  { name: 'PUT settings/shop', handler: shopSettings.PUT, method: 'PUT', path: '/api/settings/shop', body: { shopName: 'Hacked' }, allowed: STAFF },
  { name: 'POST stock-adjustment', handler: stockAdjustment.POST, method: 'POST', path: '/api/stock-adjustment', body: {}, allowed: STAFF },
  { name: 'GET stock-adjustment', handler: stockAdjustment.GET, method: 'GET', path: '/api/stock-adjustment', allowed: STAFF },
  { name: 'GET stock-adjustment/batches', handler: stockAdjustmentBatches.GET, method: 'GET', path: '/api/stock-adjustment/batches', allowed: STAFF },
  { name: 'POST suppliers', handler: suppliers.POST, method: 'POST', path: '/api/suppliers', body: { name: 'Evil supplier' }, allowed: STAFF },
  { name: 'PUT suppliers/[id]', handler: supplierItem.PUT, method: 'PUT', path: '/api/suppliers/x', body: { name: 'Hacked' }, params: () => ({ id: S.supplier.id }), allowed: STAFF },
  { name: 'POST medicines/import (AI)', handler: medicineImport.POST, method: 'POST', path: '/api/medicines/import', allowed: STAFF },
  { name: 'POST medicine/import-price-list (AI)', handler: priceListImport.POST, method: 'POST', path: '/api/medicine/import-price-list', allowed: STAFF },
  { name: 'PATCH medicines/import/batch/[id] (AI)', handler: importBatchJob.PATCH, method: 'PATCH', path: '/api/medicines/import/batch/x', params: () => ({ id: 'x' }), allowed: STAFF },
];

async function snapshot() {
  const tables = await Promise.all([
    prisma.user.findMany({ orderBy: { id: 'asc' } }),
    prisma.medicine.findMany({ orderBy: { id: 'asc' } }),
    prisma.inventoryBatch.findMany({ orderBy: { id: 'asc' } }),
    prisma.supplier.findMany({ orderBy: { id: 'asc' } }),
    prisma.rackLocation.findMany({ orderBy: { id: 'asc' } }),
    prisma.shopSettings.findMany(),
    prisma.billingSettings.findMany(),
    prisma.posPairingCode.count(),
    prisma.company.count(),
  ]);
  return JSON.stringify(tables);
}

const ROLES: Role[] = ['ADMIN', 'MANAGER', 'CASHIER'];

describe('role × API matrix: refused roles get 403 (super-admin routes: 404) and change nothing', () => {
  for (const route of routes) {
    const refused = route.allowed === 'SUPER_ADMIN' ? ROLES : ROLES.filter((r) => !(route.allowed as Role[]).includes(r));
    for (const role of refused) {
      it(`${role} → ${route.name}`, async () => {
        const user = { ADMIN: S.admin, MANAGER: S.manager, CASHIER: S.cashier }[role];
        const before = await snapshot();
        const body = route.name === 'POST users/change-password' ? { userId: S.admin.id, newPassword: 'pwned-password' } : route.body;
        const res = await call(route.handler, makeReq(route.path, { method: route.method, token: tokenFor(user), body }), route.params?.() ?? {});
        expect(res.status, JSON.stringify(res.json).slice(0, 160)).toBe(route.allowed === 'SUPER_ADMIN' ? 404 : 403);
        expect(await snapshot()).toBe(before);
      });
    }
  }

  it('unauthenticated requests are refused everywhere', async () => {
    for (const route of routes) {
      const res = await call(route.handler, makeReq(route.path, { method: route.method, body: route.body }), route.params?.() ?? {});
      expect([401, 403, 404], route.name).toContain(res.status);
    }
  });
});
