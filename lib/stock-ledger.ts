/**
 * Single source of truth for stock ledger movement direction.
 *
 * Every StockLedger row stores `qty` as a positive number; the *type* decides
 * whether it increases (+1) or decreases (-1) on-hand stock. Keeping this in one
 * place prevents the different features (billing, purchases, returns, stock
 * adjustments, reconciliation, ledger report) from disagreeing about what a
 * given type means.
 */

// Types that increase stock on hand.
export const STOCK_IN_TYPES = [
  'PURCHASE',
  'RETURN_IN', // customer return back into stock
  'ADJUSTMENT_IN',
] as const;

// Types that decrease stock on hand.
export const STOCK_OUT_TYPES = [
  'SALE',
  'RETURN_OUT', // stock sent back out (via returns endpoint)
  'SUPPLIER_RETURN', // stock returned to supplier
  'ADJUSTMENT_OUT',
] as const;

const IN_SET = new Set<string>(STOCK_IN_TYPES);
const OUT_SET = new Set<string>(STOCK_OUT_TYPES);

/**
 * Returns +1 for inbound movements, -1 for outbound movements, 0 for unknown
 * types (unknown types are ignored rather than silently miscounted).
 */
export function ledgerDirection(type: string): 1 | -1 | 0 {
  if (IN_SET.has(type)) return 1;
  if (OUT_SET.has(type)) return -1;
  return 0;
}

/**
 * Signed quantity for a ledger entry (qty is always stored positive).
 */
export function signedLedgerQty(type: string, qty: number): number {
  return ledgerDirection(type) * Number(qty);
}
