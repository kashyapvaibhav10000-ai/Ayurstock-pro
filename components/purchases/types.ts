/** Shared shapes for the purchase invoice form (page + phone sheet). */

import { packingOptionsFor } from '@/lib/stock-entry';

export interface PurchaseItemForm {
  tempId: string;
  medicineId: string;
  medicineSearch?: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  freeQty: number;
  purchaseRate: number;
  mrp: number;
  discount: number;
  gst: number;
  scheme: string;
  rackLocation: string;
  // Free-text packing (e.g. "10x10 Strips", "100ml"), saved on the batch
  // like Add Inventory. Quantity and rate are per stock unit.
  packing: string;
}

/** An existing batch of a medicine, used to suggest and complete batch rows. */
export interface BatchHint {
  batchNumber: string;
  expiryDate: string;
  mrp: number;
  packing?: string | null;
  rackLocation?: string | null;
  stockQty: number;
}

export interface MedicineHistory {
  last: { mrp?: number | string; purchaseRate?: number | string; packing?: string; rackLocation?: string } | null;
  batches: BatchHint[];
}

export const createEmptyPurchaseItem = (): PurchaseItemForm => ({
  tempId: crypto.randomUUID(),
  medicineId: '',
  medicineSearch: '',
  batchNumber: '',
  expiryDate: '',
  quantity: 1,
  freeQty: 0,
  purchaseRate: 0,
  mrp: 0,
  discount: 0,
  gst: 0,
  scheme: '',
  rackLocation: '',
  packing: '',
});

/** Packing suggestions: the medicine's known packings, then its category's usual sizes. */
export function packingSuggestions(
  medicine: { packing?: string | null; category?: string | null } | undefined,
  batches: BatchHint[] = []
): string[] {
  return Array.from(
    new Set(
      [medicine?.packing, ...batches.map((batch) => batch.packing), ...packingOptionsFor(medicine?.category)]
        .map((option) => (option || '').trim())
        .filter(Boolean)
    )
  );
}

/** The existing batch with this number, if any (case-insensitive). */
export function findBatch(batches: BatchHint[], batchNumber: string): BatchHint | undefined {
  const wanted = batchNumber.trim().toUpperCase();
  return wanted ? batches.find((batch) => batch.batchNumber.trim().toUpperCase() === wanted) : undefined;
}
