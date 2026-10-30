import { Prisma, StockMovementType } from '@prisma/client';

/**
 * The single path for changing InventoryBatch.stockQty.
 *
 * Applies a signed quantity change to a batch and appends a StockMovement row
 * with the resulting balance, using the caller's transaction so the stock
 * change and its ledger entry commit or roll back together. Decrements are
 * guarded so stock never goes negative, even under concurrent sales.
 *
 * qtyChange is in base units. A qtyChange of 0 is allowed for events that do
 * not move stock but belong in the history (DELETE / RESTORE of a batch).
 */
export interface RecordMovementInput {
  shopId: string;
  batchId: string;
  type: StockMovementType;
  qtyChange: number;
  /** Defaults to the batch's medicine. */
  medicineId?: string;
  refType?: StockRefType | null;
  refId?: string | null;
  note?: string | null;
  userId?: string | null;
}

/** What a movement's refId points at; drives the reference link in history. */
export type StockRefType =
  | 'PURCHASE'
  | 'SALE'
  | 'MEDICINE_RETURN'
  | 'SUPPLIER_RETURN'
  | 'STOCK_ADJUSTMENT'
  | 'BATCH_EDIT'
  | 'CSV_IMPORT'
  | 'RECONCILE';

export async function recordMovement(tx: Prisma.TransactionClient, input: RecordMovementInput) {
  const { shopId, batchId, type, qtyChange } = input;

  if (!Number.isInteger(qtyChange)) {
    throw new Error(`Stock change must be a whole number of base units (got ${qtyChange})`);
  }

  if (qtyChange < 0) {
    const result = await tx.inventoryBatch.updateMany({
      where: { id: batchId, shopId, stockQty: { gte: -qtyChange } },
      data: { stockQty: { increment: qtyChange } },
    });
    if (result.count === 0) {
      const current = await tx.inventoryBatch.findFirst({
        where: { id: batchId, shopId },
        select: { stockQty: true },
      });
      if (!current) throw new Error('Batch not found');
      throw new Error(
        `Insufficient stock in batch: requested ${-qtyChange}, available ${current.stockQty}`
      );
    }
  } else if (qtyChange > 0) {
    const result = await tx.inventoryBatch.updateMany({
      where: { id: batchId, shopId },
      data: { stockQty: { increment: qtyChange } },
    });
    if (result.count === 0) throw new Error('Batch not found');
  }

  const batch = await tx.inventoryBatch.findFirst({
    where: { id: batchId, shopId },
    select: { stockQty: true, medicineId: true },
  });
  if (!batch) throw new Error('Batch not found');

  return tx.stockMovement.create({
    data: {
      shopId,
      batchId,
      medicineId: input.medicineId ?? batch.medicineId,
      type,
      qtyChange,
      balanceAfter: batch.stockQty,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      note: input.note ?? null,
      userId: input.userId ?? null,
    },
  });
}

/** Movement type for a sale, by sale type. */
export function saleMovementType(saleType: string): StockMovementType {
  if (saleType === 'WHOLESALE') return 'WHOLESALE_SALE';
  if (saleType === 'TRANSFER') return 'TRANSFER_OUT';
  return 'SALE';
}

export const STOCK_MOVEMENT_TYPES: StockMovementType[] = [
  'PURCHASE',
  'MANUAL_ADD',
  'SALE',
  'WHOLESALE_SALE',
  'RETURN',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'ADJUSTMENT',
  'DELETE',
  'RESTORE',
];

/**
 * Align the ledger with physical stock without changing stock.
 *
 * Used by reconciliation when a batch's movements do not sum to its stockQty
 * (e.g. stock that predates the ledger). Writes an ADJUSTMENT row for the
 * difference so that sum(qtyChange) === stockQty again. Physical stock is
 * treated as the source of truth.
 */
export async function recordLedgerCorrection(
  tx: Prisma.TransactionClient,
  input: { shopId: string; batchId: string; ledgerSum: number; userId?: string | null }
) {
  const batch = await tx.inventoryBatch.findFirst({
    where: { id: input.batchId, shopId: input.shopId },
    select: { stockQty: true, medicineId: true },
  });
  if (!batch) throw new Error('Batch not found');

  const diff = batch.stockQty - input.ledgerSum;
  if (diff === 0) return null;

  return tx.stockMovement.create({
    data: {
      shopId: input.shopId,
      batchId: input.batchId,
      medicineId: batch.medicineId,
      type: 'ADJUSTMENT',
      qtyChange: diff,
      balanceAfter: batch.stockQty,
      refType: 'RECONCILE',
      note: `Reconciliation: ledger summed to ${input.ledgerSum}, physical stock ${batch.stockQty}`,
      userId: input.userId ?? null,
    },
  });
}
