/**
 * Stock entry helpers shared by Add Inventory and the purchase invoice form
 * (client + server safe): packing suggestions by category and the MMYY
 * expiry shorthand.
 */

export const PACKAGING_OPTIONS: Record<string, string[]> = {
  Tablet: ['10 Tab', '20 Tab', '30 Tab', '40 Tab', '60 Tab', '80 Tab', '100 Tab'],
  Capsule: ['10 Cap', '20 Cap', '30 Cap', '60 Cap'],
  Powder: ['50 gm', '100 gm', '200 gm', '500 gm'],
  Churna: ['50 gm', '100 gm', '200 gm', '500 gm'],
  Asav: ['100 ml', '200 ml', '450 ml', '680 ml'],
  Syrup: ['100 ml', '200 ml', '450 ml', '680 ml'],
  Oil: ['50 ml', '100 ml', '200 ml', '500 ml'],
  Cream: ['15 gm', '30 gm', '50 gm'],
  Gel: ['15 gm', '30 gm', '50 gm'],
  Drops: ['10 ml', '15 ml', '30 ml'],
  Bhasma: ['10 gm', '25 gm', '50 gm'],
  Vati: ['10 Tab', '20 Tab', '30 Tab', '60 Tab'],
  Chawanprash: ['250 gm', '500 gm', '1 kg'],
  Other: [],
};

/** Packing suggestions for a category name, case-insensitive. */
export function packingOptionsFor(category: string | null | undefined): string[] {
  if (!category) return [];
  const key = Object.keys(PACKAGING_OPTIONS).find((name) => name.toLowerCase() === category.trim().toLowerCase());
  return key ? PACKAGING_OPTIONS[key] : [];
}

/**
 * Parse expiry shorthand: "0727" → "2027-07-01", "1228" → "2028-12-01"
 * Also handles "07/27", "07-27", "072027", "07/2027"
 */
export function parseExpiryShorthand(input: string): string | null {
  const cleaned = input.replace(/[\/\-\s]/g, '');

  // MMYY → 4 digits
  if (/^\d{4}$/.test(cleaned)) {
    const month = parseInt(cleaned.substring(0, 2));
    const year = parseInt('20' + cleaned.substring(2, 4));
    if (month >= 1 && month <= 12 && year >= 2024 && year <= 2099) {
      return `${year}-${String(month).padStart(2, '0')}-01`;
    }
  }

  // MMYYYY → 6 digits
  if (/^\d{6}$/.test(cleaned)) {
    const month = parseInt(cleaned.substring(0, 2));
    const year = parseInt(cleaned.substring(2, 6));
    if (month >= 1 && month <= 12 && year >= 2024 && year <= 2099) {
      return `${year}-${String(month).padStart(2, '0')}-01`;
    }
  }

  return null;
}

/** "2027-07-31" (or a Date string) → "0727"; '' when unparseable. */
export function expiryToMmyy(value: string | null | undefined): string {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (match) return `${match[2]}${match[1].slice(2)}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCFullYear()).slice(2)}`;
}
