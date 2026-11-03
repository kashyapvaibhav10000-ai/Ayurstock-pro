import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { normalizeExpiry, startOfTodayUtc } from '@/lib/batch';

/**
 * Inventory Service - Handles batch-wise inventory management with FEFO
 */

type Tx = Prisma.TransactionClient;

export interface BatchIdentity {
  shopId: string;
  medicineId: string;
  batchNumber: string;
  expiryDate: Date | string;
  mrp: Prisma.Decimal | number | string;
  /**
   * Blank/omitted matches a batch with any packing (callers that do not
   * track packing, e.g. distributor invoices); a new batch then gets ''.
   */
  packing?: string | null;
}

/** MRP as stored in the batch key: 2 decimal places. */
export function normalizeMrp(mrp: Prisma.Decimal | number | string) {
  return new Prisma.Decimal(mrp).toDecimalPlaces(2);
}

/** Packing as stored in the batch key: trimmed, inner whitespace collapsed. */
export function normalizePacking(packing: string | null | undefined) {
  return (packing ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * Find the batch matching medicine + batch number + expiry + MRP + packing.
 * With a blank packing, the oldest batch matching the rest is returned.
 */
export function findBatchByIdentity(tx: Tx, key: BatchIdentity) {
  const packing = normalizePacking(key.packing);
  const base = {
    shopId: key.shopId,
    medicineId: key.medicineId,
    batchNumber: key.batchNumber.trim(),
    expiryDate: normalizeExpiry(key.expiryDate),
    mrp: normalizeMrp(key.mrp),
  };
  if (packing) {
    return tx.inventoryBatch.findUnique({
      where: { shopId_medicineId_batchNumber_expiryDate_mrp_packing: { ...base, packing } },
    });
  }
  return tx.inventoryBatch.findFirst({ where: base, orderBy: { createdAt: 'asc' } });
}

/**
 * Find the batch matching all identity fields, or create it with zero
 * stock. Callers add stock afterwards via recordMovement()
 * (lib/stock-movement.ts). `update` is applied only to an existing batch (e.g. latest
 * purchase rate); identity fields are never rewritten since they are the key.
 */
export async function findOrCreateBatch(
  tx: Tx,
  key: BatchIdentity,
  data: {
    sellingRate: Prisma.Decimal | number;
    purchaseRate?: Prisma.Decimal | number | null;
    rackLocation?: string | null;
  },
  // Stock goes through recordMovement; identity fields are part of the key.
  update?: Omit<Prisma.InventoryBatchUpdateInput, 'stockQty' | 'expiryDate' | 'batchNumber' | 'mrp' | 'packing'>
) {
  const existing = await findBatchByIdentity(tx, key);
  if (existing) {
    const batch =
      update && Object.keys(update).length > 0
        ? await tx.inventoryBatch.update({ where: { id: existing.id }, data: update })
        : existing;
    return { batch, created: false };
  }

  const batch = await tx.inventoryBatch.create({
    data: {
      shopId: key.shopId,
      medicineId: key.medicineId,
      batchNumber: key.batchNumber.trim(),
      expiryDate: normalizeExpiry(key.expiryDate),
      stockQty: 0,
      mrp: normalizeMrp(key.mrp),
      sellingRate: data.sellingRate,
      purchaseRate: data.purchaseRate ?? null,
      rackLocation: data.rackLocation ?? null,
      packing: normalizePacking(key.packing),
    },
  });
  return { batch, created: true };
}

export interface AvailableBatch {
  id: string;
  batchNumber: string;
  expiryDate: Date;
  stockQty: number;
  mrp: number;
  purchaseRate: number;
  sellingRate: number;
  packing?: string | null;
  daysToExpiry: number;
}

/**
 * Get all available batches for a medicine (FEFO ordering)
 * Returns earliest expiring batches first
 */
export async function getAvailableBatches(
  shopId: string,
  medicineId: string
): Promise<AvailableBatch[]> {
  const batches = await prisma.inventoryBatch.findMany({
    where: {
      shopId,
      medicineId,
      stockQty: { gt: 0 },
      expiryDate: { gte: startOfTodayUtc() },
      deletedAt: null,
    },
    orderBy: [
      { expiryDate: 'asc' }, // FEFO - earliest expiry first
      { createdAt: 'asc' },
    ],
  });

  return batches.map((batch: any) => ({
    ...batch,
    // Prisma Decimal fields (mrp, purchaseRate, sellingRate) are not
    // JSON-serializable as-is — NextResponse.json() throws on them, which
    // crashes any API route that returns this array directly (this broke
    // the Item Detail Popup's batch picker). Convert to plain numbers here
    // so every caller gets safely serializable data.
    mrp: Number(batch.mrp),
    purchaseRate: Number(batch.purchaseRate || 0),
    sellingRate: Number(batch.sellingRate),
    daysToExpiry: Math.ceil(
      (batch.expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    ),
  }));
}

/**
 * Allocate stock from the best batch (using FEFO)
 * Automatically picks earliest-expiring batch
 */
export async function allocateStock(
  shopId: string,
  medicineId: string,
  quantity: number
): Promise<{ batchId: string; allocated: number } | null> {
  const availableBatches = await getAvailableBatches(shopId, medicineId);

  if (availableBatches.length === 0) {
    return null; // No stock available
  }

  // Get the earliest expiring batch with sufficient stock
  for (const batch of availableBatches) {
    if (batch.stockQty >= quantity) {
      return {
        batchId: batch.id,
        allocated: quantity,
      };
    }
  }

  // If no single batch has enough, allocate from multiple batches
  // (for this MVP, we'll just pick the first one with partial stock)
  const firstBatch = availableBatches[0];
  return {
    batchId: firstBatch.id,
    allocated: Math.min(quantity, firstBatch.stockQty),
  };
}

/**
 * Get total stock for a medicine across all batches
 */
export async function getTotalStock(
  shopId: string,
  medicineId: string
): Promise<number> {
  const result = await prisma.inventoryBatch.aggregate({
    where: {
      shopId,
      medicineId,
    },
    _sum: {
      stockQty: true,
    },
  });

  return result._sum.stockQty || 0;
}

/**
 * Get medicines with low stock (total across batches)
 */
export async function getLowStockMedicines(
  shopId: string,
  _threshold?: number // Retained for compatibility, but overridden by medicine.lowStockThreshold
) {
  const allActiveBatches = await prisma.inventoryBatch.findMany({
    where: { shopId, deletedAt: null },
    include: { medicine: true },
  });

  const medicineStockMap = new Map<string, any>();

  for (const batch of allActiveBatches) {
    if (!medicineStockMap.has(batch.medicineId)) {
      medicineStockMap.set(batch.medicineId, {
        medicineId: batch.medicineId,
        name: batch.medicine.name,
        company: batch.medicine.company,
        currentStock: 0,
        minStockLevel: batch.medicine.lowStockThreshold,
      });
    }
    medicineStockMap.get(batch.medicineId)!.currentStock += batch.stockQty;
  }

  const lowStockMedicines = Array.from(medicineStockMap.values()).filter(
    (med) => med.currentStock <= med.minStockLevel
  );

  return lowStockMedicines;
}

/**
 * Get medicines near expiry (within 30 days)
 */
export async function getNearExpiryMedicines(
  shopId: string,
  daysThreshold: number = 30
) {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + daysThreshold);

  const batches = await prisma.inventoryBatch.findMany({
    where: {
      shopId,
      expiryDate: {
        lte: thirtyDaysFromNow,
        gt: new Date(),
      },
      stockQty: { gt: 0 },
    },
    include: {
      medicine: true,
    },
    orderBy: {
      expiryDate: 'asc',
    },
  });

  return batches.map((batch: any) => ({
    medicineId: batch.medicineId,
    batchId: batch.id,
    batchNumber: batch.batchNumber,
    name: batch.medicine.name,
    company: batch.medicine.company,
    expiryDate: batch.expiryDate,
    stockQty: batch.stockQty,
    daysToExpiry: Math.ceil(
      (batch.expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    ),
  }));
}
