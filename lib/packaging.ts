/**
 * Purchase packaging helpers (client + server safe).
 *
 * Invoices list quantity in packs; stock is held in base units.
 *   total units    = packs x unitsPerPack
 *   price per unit = pricePerPack / unitsPerPack
 */

export const PACK_TYPES = ['BOX', 'STRIP', 'BOTTLE', 'JAR', 'PACKET', 'LOOSE'] as const;
export type PackTypeValue = (typeof PACK_TYPES)[number];

export const PACK_TYPE_LABEL: Record<PackTypeValue, string> = {
  BOX: 'Box',
  STRIP: 'Strip',
  BOTTLE: 'Bottle',
  JAR: 'Jar',
  PACKET: 'Packet',
  LOOSE: 'Loose',
};

/** Whole number >= 1; anything else falls back to 1 (entered in units). */
export function normalizeUnitsPerPack(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Live preview text for a purchase row, e.g. "= 100 units · ₹2.50/unit". */
export function packPreview(packs: number, unitsPerPack: number, pricePerPack: number): string {
  const upp = normalizeUnitsPerPack(unitsPerPack);
  const units = Math.max(0, Math.floor(packs || 0)) * upp;
  const perUnit = (pricePerPack || 0) / upp;
  const perUnitText = perUnit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return `= ${units} unit${units === 1 ? '' : 's'} · ₹${perUnitText}/unit`;
}
