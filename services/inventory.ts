import { prisma } from '@/lib/db';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Inventory Service - Handles batch-wise inventory management with FEFO
 */

export interface AvailableBatch {
  id: string;
  batchNumber: string;
  expiryDate: Date;
  stockQty: number;
  mrp: Decimal;
  purchaseRate: Decimal;
  sellingRate: Decimal;
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
      expiryDate: { gt: new Date() },
    },
    orderBy: {
      expiryDate: 'asc', // FEFO - earliest expiry first
    },
  });

  return batches.map((batch: any) => ({
    ...batch,
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
 * Reduce stock from a batch
 */
export async function reduceStock(
  batchId: string,
  quantity: number
): Promise<boolean> {
  const batch = await prisma.inventoryBatch.findUnique({
    where: { id: batchId },
    select: { stockQty: true },
  });

  if (!batch || batch.stockQty < quantity) {
    return false; // Insufficient stock
  }

  await prisma.inventoryBatch.update({
    where: { id: batchId },
    data: {
      stockQty: { decrement: quantity },
    },
  });

  return true;
}

/**
 * Increase stock (for returns)
 */
export async function increaseStock(
  batchId: string,
  quantity: number
): Promise<boolean> {
  await prisma.inventoryBatch.update({
    where: { id: batchId },
    data: {
      stockQty: { increment: quantity },
    },
  });

  return true;
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
  threshold: number = 10
) {
  const batches = await prisma.inventoryBatch.groupBy({
    by: ['medicineId'],
    where: {
      shopId,
    },
    _sum: {
      stockQty: true,
    },
  });

  const lowStockMedicines = [];

  for (const batch of batches) {
    if ((batch._sum.stockQty || 0) <= threshold) {
      const medicine = await prisma.medicine.findUnique({
        where: { id: batch.medicineId },
      });

      if (medicine) {
        lowStockMedicines.push({
          medicineId: medicine.id,
          name: medicine.name,
          company: medicine.company,
          currentStock: batch._sum.stockQty || 0,
          minStockLevel: threshold,
        });
      }
    }
  }

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
