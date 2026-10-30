'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { batchLabel } from '@/lib/batch';

export interface CartBatchOption {
  id: string;
  batchNumber: string;
  expiryDate: string;
  stockQty: number;
  mrp: number;
  sellingRate: number;
  purchaseRate: number;
}

// One request per medicine per page session; cleared on reload.
const batchCache = new Map<string, Promise<CartBatchOption[]>>();

function loadBatches(medicineId: string): Promise<CartBatchOption[]> {
  let pending = batchCache.get(medicineId);
  if (!pending) {
    // The endpoint returns only non-expired batches with stock, FEFO-ordered,
    // so an expired batch can never be offered.
    pending = axios
      .get('/api/inventory/batches', { params: { medicineId } })
      .then((res) => (res.data?.data || []) as CartBatchOption[])
      .catch(() => {
        batchCache.delete(medicineId);
        return [];
      });
    batchCache.set(medicineId, pending);
  }
  return pending;
}

/** Drop cached batch lists (e.g. after a sale changes stock). */
export function invalidateCartBatchCache() {
  batchCache.clear();
}

interface Props {
  medicineId: string;
  value: string;
  fallbackLabel: string;
  onChange: (batch: CartBatchOption) => void;
}

/**
 * Batch picker for a cart line. Defaults to the FEFO batch chosen when the
 * item was added; the cashier can override it here.
 */
export default function CartBatchSelect({ medicineId, value, fallbackLabel, onChange }: Props) {
  const [batches, setBatches] = useState<CartBatchOption[] | null>(null);

  useEffect(() => {
    let active = true;
    loadBatches(medicineId).then((rows) => {
      if (active) setBatches(rows);
    });
    return () => {
      active = false;
    };
  }, [medicineId]);

  if (!batches || batches.length <= 1) {
    return (
      <span className="text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded uppercase">
        {fallbackLabel}
      </span>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        const next = batches.find((b) => b.id === e.target.value);
        if (next) onChange(next);
      }}
      title="Batch (default: earliest expiry first)"
      className="text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded uppercase border-none focus:ring-1 focus:ring-primary cursor-pointer"
    >
      {!batches.some((b) => b.id === value) && <option value={value}>{fallbackLabel}</option>}
      {batches.map((b, i) => (
        <option key={b.id} value={b.id}>
          {batchLabel(b, b.stockQty)}
          {i === 0 ? ' (FEFO)' : ''}
        </option>
      ))}
    </select>
  );
}
