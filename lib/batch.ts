/**
 * Batch identity helpers (safe to import from client and server code).
 *
 * A batch is identified by (shopId, medicineId, batchNumber, expiryDate).
 * The same batch number with a different expiry is a legitimately different
 * batch, so every lookup must include the normalized expiry.
 */

const ISO_DATE_PREFIX = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/;

/**
 * Normalize an expiry to the last day of its month at 00:00 UTC.
 *
 * - "YYYY-MM" / "YYYY-MM-DD" strings are read literally (no timezone shift).
 * - Full timestamps / Date objects are shifted +12h before reading the UTC
 *   month, so a local-midnight date serialized from IST (e.g. 1 Mar 00:00
 *   IST = 28 Feb 18:30Z) still lands in March.
 */
export function normalizeExpiry(input: Date | string | number): Date {
  let year: number;
  let month: number; // 0-based

  const literal = typeof input === 'string' ? input.trim().match(ISO_DATE_PREFIX) : null;
  if (literal) {
    year = Number(literal[1]);
    month = Number(literal[2]) - 1;
  } else {
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid expiry date: ${String(input)}`);
    }
    const shifted = new Date(date.getTime() + 12 * 60 * 60 * 1000);
    year = shifted.getUTCFullYear();
    month = shifted.getUTCMonth();
  }

  if (month < 0 || month > 11) {
    throw new Error(`Invalid expiry month: ${String(input)}`);
  }

  return new Date(Date.UTC(year, month + 1, 0));
}

/** "03/27" for an expiry date (UTC-based so it never shifts a month). */
export function formatExpiryShort(expiry: Date | string | null | undefined): string {
  if (!expiry) return '--/--';
  const date = normalizeExpiry(expiry instanceof Date ? expiry : String(expiry));
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(date.getUTCFullYear() % 100).padStart(2, '0');
  return `${mm}/${yy}`;
}

/**
 * Display label used everywhere a batch is shown: "B123 · Exp 03/27".
 * Pass `qty` (dropdowns) to append " · Qty 40".
 */
export function batchLabel(
  batch: { batchNumber?: string | null; expiryDate?: Date | string | null },
  qty?: number | null
): string {
  const parts = [batch.batchNumber || '—', `Exp ${formatExpiryShort(batch.expiryDate)}`];
  if (qty !== undefined && qty !== null) parts.push(`Qty ${qty}`);
  return parts.join(' · ');
}

/** True when the batch's expiry month has fully passed. */
export function isBatchExpired(expiry: Date | string, now: Date = new Date()): boolean {
  return normalizeExpiry(expiry).getTime() < startOfTodayUtc(now).getTime();
}

/** 00:00 UTC of the current day; batches with expiry >= this are sellable. */
export function startOfTodayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Stable client-side key for (medicine, batch, expiry) duplicate checks. */
export function batchIdentityKey(medicineId: string, batchNumber: string, expiry: Date | string): string {
  return `${medicineId}|${batchNumber.trim()}|${normalizeExpiry(expiry).toISOString().slice(0, 7)}`;
}

/**
 * FEFO pick: earliest non-expired batch with stock. Never returns an expired
 * batch, even if it is the only one with stock.
 */
export function pickFefoBatch<T extends { expiryDate: Date | string; stockQty: number }>(
  batches: T[],
  now: Date = new Date()
): T | null {
  const sellable = batches
    .filter((b) => b.stockQty > 0 && !isBatchExpired(b.expiryDate, now))
    .sort((a, b) => normalizeExpiry(a.expiryDate).getTime() - normalizeExpiry(b.expiryDate).getTime());
  return sellable[0] ?? null;
}
