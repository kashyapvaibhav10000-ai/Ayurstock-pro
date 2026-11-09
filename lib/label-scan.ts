/**
 * Medicine label scan (Add Inventory camera button): the prompt sent with the
 * photo and strict validation of the model's JSON reply. Pure functions, so
 * the route and tests share them.
 */

export const LABEL_SCAN_MAX_BYTES = 2 * 1024 * 1024;

export const LABEL_SCAN_PROMPT = `You read the printed label of ONE medicine package (box, bottle, strip or jar) from an Indian pharmacy.
The photo may be tilted, curved or partly blurred. Read only what is printed; never guess.

Return ONLY a JSON object, no markdown, no explanation, exactly these keys:
{
  "medicine_name": string | null,   // brand/product name as printed, without dosage instructions
  "company": string | null,         // manufacturer / marketed-by company name
  "batch": string | null,           // batch / lot number (after "B.No", "Batch No", "Lot")
  "expiry_month": number | null,    // 1-12, from "Exp", "Expiry", "Use before"
  "expiry_year": number | null,     // four digits, e.g. 2027
  "mrp": number | null,             // MRP in rupees as a number, e.g. 145.5 (no ₹, no "Rs")
  "packing": string | null,         // pack size, e.g. "10 Tab", "60 Cap", "200 ml", "100 gm"
  "confidence": number | null       // 0 to 1, how sure you are overall
}
Use null for anything you cannot read clearly. Do not read the manufacturing date as expiry.`;

export interface LabelScanResult {
  medicine_name: string | null;
  company: string | null;
  batch: string | null;
  expiry_month: number | null;
  expiry_year: number | null;
  mrp: number | null;
  packing: string | null;
  confidence: number | null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned || /^(null|n\/?a|none|unknown|-)$/i.test(cleaned)) return null;
  return cleaned.slice(0, max);
}

function number(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[₹,\s]|rs\.?/gi, '');
    if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
    return Number(cleaned);
  }
  return null;
}

/**
 * Parse and validate the model's reply. Strips ```json fences, takes the
 * first {...} object, and keeps only fields of the right type and range.
 * Returns null when the reply is not JSON or nothing usable was read.
 */
export function parseLabelScan(content: string): LabelScanResult | null {
  const unfenced = content.replace(/```(?:json)?/gi, '').trim();
  if (unfenced.startsWith('[')) return null; // one object expected, not a list
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const month = number(r.expiry_month);
  let year = number(r.expiry_year);
  if (year !== null && year >= 0 && year < 100) year += 2000;
  const validMonth = month !== null && Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
  const validYear = year !== null && Number.isInteger(year) && year >= 2000 && year <= 2099 ? year : null;

  const mrp = number(r.mrp);
  let confidence = number(r.confidence);
  if (confidence !== null && confidence > 1 && confidence <= 100) confidence /= 100;

  const result: LabelScanResult = {
    medicine_name: text(r.medicine_name, 120),
    company: text(r.company, 120),
    batch: text(r.batch, 60)?.replace(/\s+/g, '').toUpperCase() || null,
    // Month and year only make sense together.
    expiry_month: validMonth !== null && validYear !== null ? validMonth : null,
    expiry_year: validMonth !== null && validYear !== null ? validYear : null,
    mrp: mrp !== null && mrp > 0 && mrp < 1_000_000 ? Math.round(mrp * 100) / 100 : null,
    packing: text(r.packing, 60),
    confidence: confidence !== null && confidence >= 0 && confidence <= 1 ? confidence : null,
  };

  const readSomething = result.medicine_name || result.batch || result.mrp !== null || result.expiry_month !== null;
  return readSomething ? result : null;
}
