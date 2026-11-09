import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import { AiInstance, aiChain, aiFeatureRoute, loadAiKeys } from '@/lib/ai-keys';
import { AiCallContext } from '@/lib/ai/features';
import { AiFile, AiPrompt, RateLimitError, getAdapter } from '@/lib/ai/providers';
import { fetchWithTimeout, openAiChat, scrubKey } from '@/lib/ai/providers/http';
import { logAiCall } from '@/lib/ai/usage-log';
// pdf-parse will be loaded locally to avoid build-time ReferenceErrors (DOMMatrix is not defined)

export type FieldConfidence = 'high' | 'medium' | 'low';

export type MedicineConfidence = {
  overall: FieldConfidence;
  name?: FieldConfidence;
  batch?: FieldConfidence;
  expiry?: FieldConfidence;
  quantity?: FieldConfidence;
  mrp?: FieldConfidence;
  packing?: FieldConfidence;
};

export type ParsedMedicine = {
  name: string
  packing: string
  mrp: number
  tradePrice: number
  // Bill/invoice fields (optional — present when parsing purchase invoices)
  company?: string
  hsn?: string
  batchNo?: string
  expiryDate?: string   // "MM-YY" or "MMM-YY" as extracted
  purchaseRate?: number // PTS column on invoices
  quantity?: number     // Qty column on invoices
  barcode?: string      // Optional barcode
  // Upgrade 6: Confidence scoring
  confidence?: MedicineConfidence
}

export type PdfType = 'searchable' | 'scanned' | 'unknown';

export type ParseErrorCode =
  | 'NO_TEXT'
  | 'EMPTY_AFTER_CLEAN'
  | 'AI_FAILED'
  | 'TIMEOUT'
  | 'NO_API_KEY'
  | 'PARSE_ERROR';

export interface ParseResult {
  medicines: ParsedMedicine[];
  pdfType: PdfType;
  /** Provider that served the result: legacy lowercase id (e.g. 'gemini') or instance name. */
  provider?: string;
  errorCode?: ParseErrorCode;
  errorMessage?: string;
}

// ─── Env-only tiers (Cerebras, Cloudflare) ───────────────────────────────────
// Managed providers' chunk sizes, models and limits live in lib/ai/providers.
const CEREBRAS_CHUNK_SIZE = 4000  // smaller chunks to prevent JSON output truncation
const CLOUDFLARE_CHUNK_SIZE = 6000   // Reduced chunk count
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 'c51d5cf5c7c78d123c5ce4404d9040b1'
const CF_MODEL = '@cf/meta/llama-3.2-3b-instruct'
const CEREBRAS_DAILY_LIMIT = 50000  // Very generous free tier
const CLOUDFLARE_DAILY_LIMIT = 10000

const REQUEST_TIMEOUT_MS = 90000
const PDF_TIMEOUT_MS = 180000      // whole-document reads
const VISION_TIMEOUT_MS = 60000
const REQUEST_INTERVAL_MS = 1000   // 1s delay between chunks

/** Most document text one parse request may send to AI providers (keeps the per-shop daily cap meaningful). */
export const MAX_AI_TEXT_CHARS = 200_000

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a pharmacy data parser for Ayurvedic/herbal medicine documents.
The text may come from OCR (scanned documents or images) — expect noise, typos, and formatting issues.
You handle TWO document types:

TYPE A — PRICE LIST: columns are medicine name, packing, trade price, MRP
TYPE B — PURCHASE INVOICE/BILL: columns include Description, Packing, HSN, Mfg By (company), Batch No, Expiry, Qty, MRP, PTS (purchase rate), PTR

EXAMPLE PRICE LIST OUTPUT:
[
  {"name": "ADULSA SYRUP", "packing": "200ML", "mrp": 130, "tradePrice": 104},
  {"name": "ADULSA SYRUP", "packing": "400ML", "mrp": 240, "tradePrice": 192}
]

EXAMPLE INVOICE OUTPUT:
[
  {
    "name": "NATURALLY CHURNA",
    "packing": "100GM",
    "hsn": "30049011",
    "company": "AYUKALP",
    "batchNo": "CHM007",
    "expiryDate": "Jan-28",
    "mrp": 112.50,
    "tradePrice": 112.50,
    "purchaseRate": 112.50,
    "quantity": 72
  }
]

RULES:
1. Medicine names: normalize to UPPER CASE. Remove serial numbers or symbols.
2. Extract ALL packing + price combinations — one record per variant.
3. IMPORTANT TRICK FOR PRICE LISTS: If a row lists a new packing and price but the medicine name is blank (empty), you MUST INHERIT the medicine name from the previous row!
4. packing format: "200ML", "60TAB", "100GM", "1KG", "40TAB", "50GM", etc.
5. For price lists: mrp and tradePrice are required. If only one price column, use it for both. Map "T.P" column to tradePrice.
6. For invoices: extract batchNo, expiryDate (e.g. "Feb-28"), hsn, company (Mfg By column), purchaseRate (PTS column), mrp, and quantity (Qty column). Set tradePrice = purchaseRate.
7. Return ONLY valid JSON array starting with '[' and ending with ']'. No markdown, no extra text.
8. Required fields always: name (string), packing (string), mrp (number), tradePrice (number)
9. Optional fields when available: company, hsn, batchNo, expiryDate, purchaseRate, quantity
10. Ignore headers, footers, page numbers, totals, tax lines, address lines, and non-medicine text.
11. Extract ALL medicines — do not stop early. On invoices, check for duplicate item names and extract BOTH if they have different quantities or indices.
12. NEVER extract disease names as medicine names.
13. Medicine names are product brand names like 'TRIPHALA CHURNA', 'ADULSA SYRUP'.
14. Price sanity: MRP must be 1–100000. TradePrice must be ≤ MRP. Skip impossible prices.`

// ─── Prisma usage tracking (legacy daily counters) ───────────────────────────
type UsageField = 'gemini' | 'cerebras' | 'groq' | 'cloudflare' | 'mistral' | 'openrouter';
type DailyUsage = Record<UsageField, number>;

async function getDailyUsage(): Promise<DailyUsage> {
  const empty = { gemini: 0, cerebras: 0, groq: 0, openrouter: 0, cloudflare: 0, mistral: 0 };
  try {
    const today = new Date().toISOString().split('T')[0];
    const record = await prisma.apiUsageCounter.findUnique({ where: { date: today } });
    return record || empty;
  } catch (e) {
    return empty;
  }
}

async function incrementUsage(provider: UsageField | null) {
  if (!provider) return;
  try {
    const today = new Date().toISOString().split('T')[0];
    await prisma.apiUsageCounter.upsert({
      where: { date: today },
      update: { [provider]: { increment: 1 } },
      create: { date: today, [provider]: 1 }
    });
  } catch (e) { }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractJsonArray(text: string): string {
  let cleaned = text.trim()
  cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/m, '')
  const first = cleaned.indexOf('[')
  const last = cleaned.lastIndexOf(']')
  if (first !== -1 && last !== -1 && last > first) {
    return cleaned.substring(first, last + 1)
  }
  return cleaned
}

function normalizeMedicine(item: any): ParsedMedicine | null {
  if (!item || typeof item !== 'object') return null
  const name = typeof item.name === 'string' ? item.name.trim() : ''
  const packing = typeof item.packing === 'string' ? item.packing.trim() : ''
  
  // Be more lenient with pricing for invoice imports
  const mrp = (typeof item.mrp === 'number' && !Number.isNaN(item.mrp)) ? item.mrp : (Number(item.mrp) || 0)
  const tradePrice = (typeof item.tradePrice === 'number' && !Number.isNaN(item.tradePrice)) ? item.tradePrice : (Number(item.tradePrice) || 0)
  
  if (!name.trim()) return null
  
  const normalized: ParsedMedicine = { 
    name: name.trim(), 
    packing: packing.trim(), 
    mrp: Number(mrp), 
    tradePrice: Number(tradePrice) 
  }
  
  if (item.company && typeof item.company === 'string') normalized.company = item.company.trim()
  if (item.hsn && (typeof item.hsn === 'string' || typeof item.hsn === 'number')) normalized.hsn = String(item.hsn).trim()
  if (item.batchNo && typeof item.batchNo === 'string') normalized.batchNo = item.batchNo.trim()
  if (item.expiryDate && typeof item.expiryDate === 'string') normalized.expiryDate = normalizeExpiryDate(item.expiryDate.trim())
  if (item.barcode && typeof item.barcode === 'string') normalized.barcode = item.barcode.trim()

  if (typeof item.purchaseRate === 'number' || (item.purchaseRate && !Number.isNaN(Number(item.purchaseRate)))) {
    normalized.purchaseRate = Number(item.purchaseRate)
  }
  // PTR (Price to Retailer) — store as tradePrice if not already set
  if (typeof item.ptr === 'number' || (item.ptr && !Number.isNaN(Number(item.ptr)))) {
    normalized.tradePrice = Number(item.ptr)
  }
  // Cash Discount %
  if (typeof item.cashDiscount === 'number' || (item.cashDiscount && !Number.isNaN(Number(item.cashDiscount)))) {
    (normalized as any).cashDiscount = Number(item.cashDiscount)
  }
  // Discount %
  if (typeof item.discount === 'number' || (item.discount && !Number.isNaN(Number(item.discount)))) {
    (normalized as any).discount = Number(item.discount)
  }
  if (typeof item.quantity === 'number' || (item.quantity && !Number.isNaN(Number(item.quantity)))) {
    normalized.quantity = Number(item.quantity)
  }

  // Upgrade 6: Confidence scoring
  if (item.confidence && typeof item.confidence === 'object') {
    // AI provided confidence directly
    normalized.confidence = {
      overall: item.confidence.overall || 'medium',
      name: item.confidence.name,
      batch: item.confidence.batch,
      expiry: item.confidence.expiry,
      quantity: item.confidence.quantity,
      mrp: item.confidence.mrp,
      packing: item.confidence.packing,
    }
  } else {
    // Compute heuristically based on field presence/quality
    normalized.confidence = computeConfidence(normalized)
  }
  
  return normalized
}

// ── Upgrade 6: Heuristic confidence computation ─────────────────────────
function computeConfidence(med: ParsedMedicine): MedicineConfidence {
  const fc = (val: any, fieldType: string): FieldConfidence => {
    if (val === null || val === undefined || val === '' || val === 0) return 'low'
    if (fieldType === 'name' && typeof val === 'string') {
      if (val.length < 3) return 'low'
      if (val.length > 40 || /\d{3,}/.test(val)) return 'medium'
      return 'high'
    }
    if (fieldType === 'batch' && typeof val === 'string') {
      if (val.length < 2) return 'low'
      return 'high'
    }
    if (fieldType === 'expiry' && typeof val === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return 'high'
      if (/[a-zA-Z]{3}/.test(val)) return 'medium' // was normalized
      return 'low'
    }
    if (fieldType === 'number') {
      const num = Number(val)
      if (isNaN(num) || num <= 0) return 'low'
      return 'high'
    }
    if (fieldType === 'packing' && typeof val === 'string') {
      if (/\d+\s*(tab|cap|gm|ml|kg)/i.test(val)) return 'high'
      return 'medium'
    }
    return 'medium'
  }

  const nameConf = fc(med.name, 'name')
  const batchConf = fc(med.batchNo, 'batch')
  const expiryConf = fc(med.expiryDate, 'expiry')
  const qtyConf = fc(med.quantity, 'number')
  const mrpConf = fc(med.mrp, 'number')
  const packingConf = fc(med.packing, 'packing')

  const levels: FieldConfidence[] = [nameConf, batchConf, expiryConf, qtyConf, mrpConf, packingConf]
  const overall: FieldConfidence = levels.includes('low') ? 'low' : levels.includes('medium') ? 'medium' : 'high'

  return { overall, name: nameConf, batch: batchConf, expiry: expiryConf, quantity: qtyConf, mrp: mrpConf, packing: packingConf }
}


// Dedup removed — bulk-insert handles DB-level deduplication via upsert.
// Removing this ensures the frontend review screen shows all extracted medicines.
/**
 * Merge duplicate medicines (same name + company + packing) by summing quantities
 * and keeping the best data from each row.
 */
function dedup(medicines: ParsedMedicine[]): ParsedMedicine[] {
  const mergeMap = new Map<string, ParsedMedicine>();

  for (const med of medicines) {
    // Key: lowercase name + company + packing
    const key = [
      (med.name || '').trim().toLowerCase(),
      (med.company || '').trim().toLowerCase(),
      (med.packing || '').trim().toLowerCase(),
    ].join('|');

    const existing = mergeMap.get(key);
    if (existing) {
      // Sum quantities
      existing.quantity = (existing.quantity || 0) + (med.quantity || 0);
      // Keep the better data (first non-empty value wins)
      existing.batchNo = existing.batchNo || med.batchNo;
      existing.expiryDate = existing.expiryDate || med.expiryDate;
      existing.mrp = existing.mrp || med.mrp;
      existing.purchaseRate = existing.purchaseRate || med.purchaseRate;
      existing.tradePrice = existing.tradePrice || med.tradePrice;
      existing.hsn = existing.hsn || med.hsn;
      existing.barcode = existing.barcode || med.barcode;
      console.log(`  🔀 Merged duplicate "${med.name}" — combined qty: ${existing.quantity}`);
    } else {
      // Clone so we don't mutate the original
      mergeMap.set(key, { ...med });
    }
  }

  return Array.from(mergeMap.values());
}

function parseJsonSafely(text: string): ParsedMedicine[] {
  let cleaned = text.trim()
  cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/m, '')
  
  let parsed: any
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // Try extracting just the array portion
    const jsonText = extractJsonArray(cleaned)
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      // Try to salvage truncated JSON
      const lastComma = jsonText.lastIndexOf('},')
      if (lastComma > 0) {
        try {
          parsed = JSON.parse(jsonText.substring(0, lastComma + 1) + ']')
          console.warn(`⚠️ Salvaged ${parsed.length} items from truncated JSON`)
        } catch {
          throw new Error('AI response JSON is too malformed to recover')
        }
      } else {
        throw new Error('AI response was not valid JSON')
      }
    }
  }
  
  // Handle new format: { invoiceNumber, medicines: [...] }
  let itemArray: any[]
  if (parsed && !Array.isArray(parsed) && typeof parsed === 'object' && Array.isArray(parsed.medicines)) {
    // Extract metadata and log it
    if (parsed.invoiceNumber) console.log(`📋 Invoice #: ${parsed.invoiceNumber}`);
    if (parsed.invoiceDate) console.log(`📅 Invoice Date: ${parsed.invoiceDate}`);
    if (parsed.supplierName) console.log(`🏢 Supplier: ${parsed.supplierName}`);
    itemArray = parsed.medicines
  } else if (Array.isArray(parsed)) {
    itemArray = parsed
  } else {
    throw new Error('AI response was not a JSON array or {medicines: [...]} object')
  }
  
  const medicines: ParsedMedicine[] = []
  for (const raw of itemArray) {
    const normalized = normalizeMedicine(raw)
    if (normalized) medicines.push(normalized)
  }
  return medicines
}

function cleanOcrText(rawOcrText: string): string {
  const lines = rawOcrText.split('\n')
  const cleanedLines: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length < 2) continue
    if (/^[\u0900-\u097F\s]+$/.test(trimmed)) continue
    if (trimmed.includes('===') || trimmed.includes('---')) continue
    if (/^(page|total|grand total|sub total|subtotal)\s*[:\d]*$/i.test(trimmed)) continue
    if (/^\d+$/.test(trimmed) && trimmed.length <= 3) continue
    cleanedLines.push(trimmed)
  }
  return cleanedLines.join('\n')
}

function splitTextIntoChunks(text: string, maxChars: number): string[] {
  const lines = text.split('\n')
  const chunks: string[] = []
  let currentChunk = ''
  const OVERLAP_LINES = 5
  // Safety cap to prevent infinite accumulation when PDF text lacks newlines
  const MAX_OVERLAP_CHARS = 500

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    
    const potentialLength = currentChunk.length + line.length + (currentChunk ? 1 : 0)
    
    if (potentialLength > maxChars && currentChunk) {
      chunks.push(currentChunk)
      
      let overlapLines = currentChunk.split('\n').slice(-OVERLAP_LINES)
      let overlapText = overlapLines.join('\n')
      
      if (overlapText.length > MAX_OVERLAP_CHARS) {
        overlapText = overlapText.substring(overlapText.length - MAX_OVERLAP_CHARS)
      }
      
      currentChunk = overlapText
    }
    
    currentChunk += (currentChunk ? '\n' : '') + line
  }
  
  if (currentChunk) chunks.push(currentChunk)
  return chunks
}

type ChunkResult = {
  medicines: ParsedMedicine[];
  completedChunks: number;
  totalChunks: number;
  rateLimited: boolean;
  lastError: string | null;
}

async function processChunks(
  chunks: string[],
  processFn: (chunk: string, index: number, total: number) => Promise<ParsedMedicine[]>,
  delayMs: number = REQUEST_INTERVAL_MS
): Promise<ChunkResult> {
  const allMedicines: ParsedMedicine[] = []
  let completedChunks = 0
  let rateLimited = false
  let lastError: string | null = null
  for (let i = 0; i < chunks.length; i++) {
    try {
      console.log(`  chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`)
      const medicines = await processFn(chunks[i], i, chunks.length)
      allMedicines.push(...medicines)
      completedChunks++
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err)
      lastError = msg
      console.warn(`  ⚠️ Chunk ${i + 1}/${chunks.length} failed: ${msg}`)
      // On rate limit, stop sending more chunks (they'll all fail too)
      if (msg.includes('RATE_LIMIT') || err?.status === 429) {
        console.warn(`  🛑 Rate limited at chunk ${i + 1}/${chunks.length}. Keeping ${allMedicines.length} medicines from ${completedChunks} chunks.`)
        rateLimited = true
        break
      }
    }
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  return { medicines: allMedicines, completedChunks, totalChunks: chunks.length, rateLimited, lastError }
}

// ─── Vision: invoice image prompt ─────────────────────────────────────
const INVOICE_IMAGE_PROMPT = `You are a world-class OCR expert for Indian Pharmacy Invoices.
The image might be tilted or photographed at an angle. Mentally correct the orientation.

### 1. COLUMN MAPPING (Read headers carefully):
You MUST map the following columns. Look at the TABLE HEADER ROW to identify each column:
- "Sr." or "S.No" → srNo (integer)
- "Description of Goods" or "Particulars" → name (FULL medicine name)
- "Packing" → packing (e.g. "100 GM", "30 TAB", "40 TAB", "80 TAB", "10 GM")
- "Batch No" → batchNo (alphanumeric code like "CH0087", "TA8647", "NL1610")
- "Exp Dt" or "Expiry" → expiryDate (format: "MMM-YY", e.g. "Sep-26", "Nov-25", "Jan-28")
- "MRP" → mrp (Maximum Retail Price)
- "PTS" → purchaseRate (Price to Stockist — this is YOUR purchase price)
- "PTR" → ptr (Price to Retailer — reference selling price)
- "Qty" → quantity (integer — number of units ordered)
- "Disc%" → discount (trade discount percentage)
- "CD%" → cashDiscount (cash discount percentage)
- "Mfg By" or Company header → company

### 2. EXTRACTION RULES:
- Extract each row that has a numeric Sr. No (1, 2, 3...).
- STOP at the "Total" or "Taxable Amount" row.
- DO NOT extract footer text (bank details, GSTIN, terms, etc.).
- Packing must be SEPARATE from Name. Example: Name="NATURALLY CHURNA", Packing="100 gm".
- If two rows have the same medicine name, extract BOTH as separate JSON objects.
- Use null for any value you truly cannot read. DO NOT invent values.

### 3. INVOICE METADATA:
Also extract these from the invoice header (outside the table):
- invoiceNumber (e.g. "AIU25G6408")
- invoiceDate (e.g. "27-Feb-26")
- supplierName (e.g. "AYUKALP UAP PHARMA PVT LTD")

Return a JSON object with this structure:
{
  "invoiceNumber": "AIU25G6408",
  "invoiceDate": "27-Feb-26",
  "supplierName": "AYUKALP UAP PHARMA PVT LTD",
  "medicines": [
    {
      "srNo": 1,
      "name": "NATURALLY CHURNA",
      "packing": "100 gm",
      "batchNo": "CH0087",
      "expiryDate": "Sep-26",
      "mrp": 112.50,
      "purchaseRate": 88.16,
      "ptr": 93.75,
      "quantity": 72,
      "discount": 5,
      "cashDiscount": 2,
      "company": "AYUKALP",
      "confidence": {
        "overall": "high",
        "name": "high",
        "batch": "high",
        "expiry": "medium",
        "quantity": "high",
        "mrp": "high",
        "packing": "high"
      }
    }
  ]
}

### 4. CONFIDENCE RULES:
For each field, set confidence:
- "high": field was clearly visible and easily read
- "medium": field was partially visible or needed inference (e.g. blurry digits, format guessing)
- "low": field was guessed, very blurry, or filled with null
Set overall to the LOWEST of all field confidences.

Return ONLY valid JSON. NO explanation. NO markdown.`;

// ── Vision Tier Helpers ───────────────────────────────────────────────────────

/**
 * Normalize packing strings from AI output (e.g. "100GM", "100 Gm", "30TAB")
 * into the format used by UI dropdowns (e.g. "100 gm", "30 Tab", "200 ml").
 */
function normalizePacking(raw?: string): string {
  if (!raw) return '';
  let s = raw.trim();

  // Insert a space between number and unit if missing: "100GM" → "100 GM"
  s = s.replace(/(\d)(gm|gms|gram|g|ml|tab|tablet|tablets|cap|capsule|capsules|kg|l|litre)\b/i, '$1 $2');

  // Normalize the unit part
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(.+)$/i);
  if (!match) return s;

  const num = match[1];
  const unit = match[2].trim().toLowerCase();

  // Map unit synonyms to dropdown-compatible labels
  const unitMap: Record<string, string> = {
    'gm': 'gm', 'gms': 'gm', 'g': 'gm', 'gram': 'gm', 'grams': 'gm',
    'ml': 'ml', 'l': 'L', 'litre': 'L', 'liter': 'L',
    'tab': 'Tab', 'tablet': 'Tab', 'tablets': 'Tab',
    'cap': 'Cap', 'capsule': 'Cap', 'capsules': 'Cap',
    'kg': 'kg',
  };

  const normalized = unitMap[unit] || unit;
  return `${num} ${normalized}`;
}

/**
 * Normalize expiry date from AI output formats to YYYY-MM-DD (last day of month).
 * Pharmacy standard: expiry = last day of the month.
 * Handles: "Sep-26", "Sep-2026", "09/26", "09-26", "Sep 26", "September-26"
 */
function normalizeExpiryDate(raw: string): string {
  if (!raw) return raw;
  const s = raw.trim();

  const monthMap: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6,
    jul: 7, july: 7, aug: 8, august: 8, sep: 9, september: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };

  let month: number | undefined;
  let year: number | undefined;

  // Try "MMM-YY" or "MMM YY" or "MMM-YYYY" (e.g. "Sep-26", "Jan-28", "Sep-2026")
  const mmmYY = s.match(/^([a-zA-Z]+)[- /](\d{2,4})$/);
  if (mmmYY) {
    month = monthMap[mmmYY[1].toLowerCase()];
    year = parseInt(mmmYY[2]);
    if (year < 100) year += 2000; // 26 → 2026
  }

  // Try "MM/YY" or "MM-YY" (e.g. "09/26", "01-28")
  if (!month) {
    const mmYY = s.match(/^(\d{1,2})[/-](\d{2,4})$/);
    if (mmYY) {
      month = parseInt(mmYY[1]);
      year = parseInt(mmYY[2]);
      if (year < 100) year += 2000;
    }
  }

  if (!month || !year || month < 1 || month > 12) return s; // Can't parse, return as-is

  // Get last day of the month
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  const dd = String(lastDay).padStart(2, '0');

  return `${year}-${mm}-${dd}`;
}

/**
 * Apply packing normalization to all extracted medicines.
 */
function normalizeMedicines(medicines: ParsedMedicine[]): ParsedMedicine[] {
  return medicines.map(m => ({
    ...m,
    name: m.name?.trim() || '',
    packing: normalizePacking(m.packing),
    expiryDate: m.expiryDate ? normalizeExpiryDate(m.expiryDate) : undefined,
  }));
}

function logExtractedMedicines(medicines: ParsedMedicine[], provider: string) {
  console.log(`🖼️ ${provider} extracted ${medicines.length} medicines from image`);
  medicines.forEach((m, i) => {
    console.log(`  [${i + 1}] ${m.name} | Pack: ${m.packing || '-'} | Batch: ${m.batchNo || '-'} | Qty: ${m.quantity || '-'} | MRP: ${m.mrp} | PTS: ${m.purchaseRate || m.tradePrice}`);
  });
}

// ─── Extract text from PDF for lower tiers ────────────────────────────────────
async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  // Try pdf-parse first
  // pdf-parse v2 is a class (the v1 function call threw and was swallowed,
  // so this path never ran).
  try {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
    try {
      const pdfData = await parser.getText({ first: 100 });
      if (pdfData.text && pdfData.text.trim().length > 50) {
        return pdfData.text;
      }
    } finally {
      await parser.destroy();
    }
  } catch (e) { }

  // Fallback to pdf2json
  const PDFParser = require('pdf2json');
  return new Promise<string>((resolve) => {
    let extractedText = '';
    const parser = new PDFParser();
    let completed = false;

    const timeout = setTimeout(() => {
      if (!completed) { completed = true; resolve(''); }
    }, 5000);

    parser.on('pdfParser_dataError', () => {
      if (!completed) { completed = true; clearTimeout(timeout); resolve(''); }
    });

    parser.on('pdfParser_dataReady', (pdfData: any) => {
      if (completed) return;
      try {
        if (pdfData.pages && Array.isArray(pdfData.pages)) {
          for (let pageNum = 0; pageNum < Math.min(pdfData.pages.length, 100); pageNum++) {
            const page = pdfData.pages[pageNum];
            if (page.texts && Array.isArray(page.texts)) {
              const pageText = page.texts
                .map((item: any) => {
                  try { if (item.R && item.R[0]?.T) return decodeURIComponent(item.R[0].T); } catch (e) { }
                  return '';
                })
                .filter((t: string) => t)
                .join(' ');
              if (pageText.trim()) extractedText += pageText + '\n';
            }
          }
        }
        completed = true; clearTimeout(timeout); resolve(extractedText);
      } catch { completed = true; clearTimeout(timeout); resolve(''); }
    });

    try { parser.parseBuffer(pdfBuffer); }
    catch { completed = true; clearTimeout(timeout); resolve(''); }
  });
}

// ─── Provider chain ───────────────────────────────────────────────────────────

/** One step of the fallback chain: a provider instance or an env-only tier. */
type Tier = {
  label: string;           // provider name reported back to the caller
  instanceId: string | null;
  adapter: string;
  model: string | null;
  supportsPdf: boolean;
  supportsImage: boolean;
  chunkSize: number;
  delayMs: number;
  usageField: UsageField | null;
  key: string;
  available: (usage: DailyUsage) => boolean;
  call: (prompt: AiPrompt, files?: AiFile[]) => Promise<string>;
};

const TEXT_USER_PROMPT = (chunk: string) => `Extract medicines from this text. Return ONLY JSON array:\n\n${chunk}`;

/** Provider name in results: the original lowercase id for legacy slots (UIs key off it). */
function tierLabel(instance: AiInstance): string {
  return instance.provider ? instance.provider.toLowerCase() : instance.displayName;
}

function instanceTier(instance: AiInstance): Tier {
  const adapter = getAdapter(instance.adapter)!;
  const config = { key: instance.key!, model: instance.model, baseUrl: instance.baseUrl };
  // Daily limits belong to the original providers' free tiers.
  const limited = instance.provider ? adapter : null;
  return {
    label: tierLabel(instance),
    instanceId: instance.id,
    adapter: adapter.id,
    model: instance.model || adapter.defaultModel || null,
    supportsPdf: adapter.supportsPdf,
    supportsImage: adapter.supportsImage,
    chunkSize: adapter.chunkSize,
    delayMs: adapter.delayMs,
    usageField: limited?.usageField ?? null,
    key: config.key,
    available: (usage) => !limited?.usageField || !limited.dailyLimit || usage[limited.usageField] < limited.dailyLimit,
    call: (prompt, files) => adapter.call(config, prompt, files),
  };
}

/** Cerebras and Cloudflare: text-only, configured through .env alone. */
function envTiers(): Array<{ slot: number; tier: Tier }> {
  const tiers: Array<{ slot: number; tier: Tier }> = [];
  const cerebrasKey = process.env.CEREBRAS_API_KEY;
  if (cerebrasKey) {
    tiers.push({
      slot: 2,
      tier: {
        label: 'cerebras', instanceId: null, adapter: 'CEREBRAS', model: 'llama3.1-8b',
        supportsPdf: false, supportsImage: false, chunkSize: CEREBRAS_CHUNK_SIZE, delayMs: 1000,
        usageField: 'cerebras', key: cerebrasKey,
        available: (usage) => usage.cerebras < CEREBRAS_DAILY_LIMIT,
        call: (prompt) => openAiChat({
          label: 'Cerebras', url: 'https://api.cerebras.ai/v1/chat/completions', key: cerebrasKey,
          model: 'llama3.1-8b', prompt, maxTokens: 8192,
        }),
      },
    });
  }
  const cloudflareKey = process.env.CLOUDFLARE_API_TOKEN;
  if (cloudflareKey) {
    tiers.push({
      slot: 4,
      tier: {
        label: 'cloudflare', instanceId: null, adapter: 'CLOUDFLARE', model: CF_MODEL,
        supportsPdf: false, supportsImage: false, chunkSize: CLOUDFLARE_CHUNK_SIZE, delayMs: REQUEST_INTERVAL_MS,
        usageField: 'cloudflare', key: cloudflareKey,
        available: (usage) => usage.cloudflare < CLOUDFLARE_DAILY_LIMIT,
        call: async (prompt) => {
          const resp = await fetchWithTimeout(
            `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cloudflareKey}` },
              body: JSON.stringify({
                messages: [
                  { role: 'system', content: prompt.system ?? '' },
                  { role: 'user', content: prompt.user }
                ],
                max_tokens: 2048
              }),
            },
            prompt.timeoutMs ?? REQUEST_TIMEOUT_MS
          );
          if (resp.status === 429) throw new RateLimitError();
          if (!resp.ok) throw new Error(`Cloudflare status ${resp.status}`);
          const data = await resp.json();
          const content = data?.result?.response || '';
          if (!content) throw new Error('Empty response from Cloudflare');
          return content;
        },
      },
    });
  }
  return tiers;
}

/**
 * The chain for a feature. A custom per-feature order is used as-is; the
 * global chain also keeps the env-only tiers in their historical slots
 * (Gemini, Mistral, Cerebras, Groq, Cloudflare, OpenRouter by default).
 */
function buildChain(feature: AiCallContext['feature']): Tier[] {
  const chain = aiChain(feature).map(instanceTier);
  if (aiFeatureRoute(feature)) return chain;
  for (const { slot, tier } of envTiers()) chain.splice(Math.min(slot, chain.length), 0, tier);
  return chain;
}

/** Records every provider attempt of one parse request under a shared requestId. */
function attemptLogger(ctx: AiCallContext) {
  const requestId = randomUUID();
  let attempts = 0;
  return {
    async record(tier: Tier, started: number, success: boolean, error?: unknown) {
      attempts++;
      const message = error === undefined || error === null ? null : error instanceof Error ? error.message : String(error);
      await logAiCall({
        requestId, feature: ctx.feature, shopId: ctx.shopId, instanceId: tier.instanceId, adapter: tier.adapter,
        providerName: tier.label, model: tier.model, success, latencyMs: Date.now() - started,
        error: message ? scrubKey(message, tier.key) : null,
      });
    },
    /** A request no provider could take still counts as a failed call. */
    async finish(reason: string) {
      if (attempts > 0) return;
      await logAiCall({
        requestId, feature: ctx.feature, shopId: ctx.shopId, instanceId: null, adapter: 'NONE',
        providerName: 'none', model: null, success: false, latencyMs: 0, error: reason,
      });
    },
  };
}

/**
 * Walk the chain. PDF-capable providers read the whole PDF while nothing has
 * been extracted yet; every other step works on document text, and a
 * rate-limited provider hands its unprocessed chunks to the next one.
 */
async function runChain(
  ctx: AiCallContext,
  input: { pdf: Buffer | null; text: () => Promise<string> },
  pdfType: PdfType
): Promise<ParseResult> {
  await loadAiKeys();
  const usage = await getDailyUsage();
  const chain = buildChain(ctx.feature);
  const log = attemptLogger(ctx);

  const allMedicines: ParsedMedicine[] = [];
  const usedProviders: string[] = [];
  let text: string | null = null;
  let remainingText: string | null = null; // null until the text relay starts

  for (const tier of chain) {
    if (!tier.available(usage)) {
      console.log(`  ⏭️ ${tier.label}: daily limit reached, skipping.`);
      continue;
    }

    // Whole-document read.
    if (input.pdf && tier.supportsPdf && remainingText === null) {
      const started = Date.now();
      try {
        console.log(`📄 ${tier.label}: reading whole PDF...`);
        const content = await tier.call(
          { system: SYSTEM_PROMPT, user: 'Extract medicines from this PDF. Return ONLY valid JSON array.', timeoutMs: PDF_TIMEOUT_MS },
          [{ mimeType: 'application/pdf', data: input.pdf.toString('base64') }]
        );
        const medicines = parseJsonSafely(content);
        console.log(`📄 ${tier.label} extracted ${medicines.length} medicines`);
        if (medicines.length > 0) {
          await log.record(tier, started, true);
          await incrementUsage(tier.usageField);
          return { medicines: dedup(medicines), pdfType: 'searchable', provider: tier.label };
        }
        await log.record(tier, started, false, 'No medicines extracted');
      } catch (error) {
        console.error(`  ❌ ${tier.label} PDF error: ${error instanceof Error ? error.message : error}`);
        await log.record(tier, started, false, error);
      }
      continue;
    }

    // Text relay.
    if (text === null) {
      if (input.pdf) console.log('🔧 Extracting text from PDF for text providers...');
      text = await input.text();
      if (input.pdf && text.trim()) console.log(`📊 Extracted ${text.length} chars from PDF`);
    }
    if (!text.trim()) continue; // scanned PDF: only PDF-capable providers can help
    if (remainingText === null) remainingText = text.slice(0, MAX_AI_TEXT_CHARS);
    if (remainingText.trim().length < 50) break;

    const started = Date.now();
    try {
      console.log(`\n🔗 Relay → ${tier.label} (${remainingText.length} chars remaining)`);
      const chunks = splitTextIntoChunks(remainingText, tier.chunkSize);
      console.log(`  ${tier.label}: ${chunks.length} chunks`);

      // Every chunk is one provider call and gets its own AiCallLog row, so the
      // per-shop daily cap counts calls, not requests.
      const result = await processChunks(
        chunks,
        async (chunk) => {
          const chunkStarted = Date.now();
          try {
            const parsed = parseJsonSafely(await tier.call({ system: SYSTEM_PROMPT, user: TEXT_USER_PROMPT(chunk) }));
            await log.record(tier, chunkStarted, true);
            return parsed;
          } catch (error) {
            await log.record(tier, chunkStarted, false, error);
            throw error;
          }
        },
        tier.delayMs
      );
      allMedicines.push(...result.medicines);

      const success = result.medicines.length > 0;
      if (success) {
        usedProviders.push(tier.label);
        await incrementUsage(tier.usageField);
      }

      // Nothing got through (bad key, outage): try the next provider on the same text.
      if (result.completedChunks === 0) continue;

      if (!result.rateLimited) {
        console.log(`  ✅ ${tier.label} completed all ${result.totalChunks} chunks. Total: ${allMedicines.length} medicines.`);
        break;
      }

      remainingText = chunks.slice(result.completedChunks).join('\n');
      console.log(`  🔄 ${tier.label} completed ${result.completedChunks}/${result.totalChunks} chunks (${result.medicines.length} medicines). Relaying ${remainingText.length} chars to next tier...`);
    } catch (error) {
      console.error(`  ❌ ${tier.label} error: ${error instanceof Error ? error.message : error}`);
      await log.record(tier, started, false, error);
    }
  }

  if (allMedicines.length > 0) {
    console.log(`\n🏁 Relay complete! ${allMedicines.length} total medicines from [${usedProviders.join(' → ')}]`);
    return { medicines: dedup(allMedicines), pdfType, provider: usedProviders[0] };
  }

  if (input.pdf && text !== null && !text.trim()) {
    await log.finish('No text in PDF and no PDF-capable provider succeeded');
    return {
      medicines: [], pdfType: 'scanned', errorCode: 'NO_TEXT',
      errorMessage: 'This PDF appears to be scanned/image-based. Use the "Run OCR" button.',
    };
  }
  if (chain.length === 0) {
    await log.finish('No AI provider configured');
    return { medicines: [], pdfType, errorCode: 'NO_API_KEY', errorMessage: 'No AI provider is configured.' };
  }
  await log.finish('No provider was available');
  return { medicines: [], pdfType, errorCode: 'AI_FAILED', errorMessage: 'All AI tiers failed.' };
}

// ─── MAIN: parsePDFWithAI ─────────────────────────────────────────────────────
export async function parsePDFWithAI(pdfBuffer: Buffer, ctx: AiCallContext): Promise<ParseResult> {
  console.log(`\n📖 Starting PDF parsing sequence [${ctx.feature}]...`);
  return runChain(ctx, { pdf: pdfBuffer, text: () => extractTextFromPDF(pdfBuffer) }, 'searchable');
}

// ─── MAIN: parseTextWithAI ────────────────────────────────────────────────────
export async function parseTextWithAI(extractedText: string, ctx: AiCallContext): Promise<ParseResult> {
  console.log(`\n📖 Starting TEXT parsing sequence [${ctx.feature}]...`);
  if (!extractedText.trim()) {
    return { medicines: [], pdfType: 'scanned', errorCode: 'NO_TEXT', errorMessage: 'The provided text is empty.' };
  }
  const cleanedText = cleanOcrText(extractedText);
  return runChain(ctx, { pdf: null, text: async () => cleanedText }, 'scanned');
}

// ─── MAIN: parseImageWithGeminiVision (any image-capable provider) ───────────
export async function parseImageWithGeminiVision(imageBuffer: Buffer, mimeType: string, ctx: AiCallContext): Promise<ParseResult> {
  await loadAiKeys();
  const usage = await getDailyUsage();
  const chain = buildChain(ctx.feature).filter((tier) => tier.supportsImage);
  const log = attemptLogger(ctx);
  const data = imageBuffer.toString('base64');
  const errors: string[] = [];

  for (const [index, tier] of chain.entries()) {
    if (!tier.available(usage)) {
      errors.push(`${tier.label}: daily limit reached`);
      continue;
    }
    const started = Date.now();
    try {
      console.log(`🖼️ [Tier ${index + 1}] ${tier.label} Vision (${imageBuffer.length} bytes)...`);
      const content = await tier.call({ user: INVOICE_IMAGE_PROMPT, timeoutMs: VISION_TIMEOUT_MS }, [{ mimeType, data }]);
      console.log(`🖼️ ${tier.label} raw (first 300): ${content.substring(0, 300)}`);
      const medicines = normalizeMedicines(parseJsonSafely(content));
      logExtractedMedicines(medicines, tier.label);

      // QUALITY CHECK (Groq): if more than 40% of rows have no batch/qty, fall back.
      const lowQuality = tier.adapter === 'GROQ' &&
        medicines.filter(m => !m.batchNo || m.batchNo === 'NA' || !m.quantity).length / (medicines.length || 1) > 0.4;
      if (medicines.length > 0 && !lowQuality) {
        await log.record(tier, started, true);
        await incrementUsage(tier.usageField);
        return { medicines: dedup(medicines), pdfType: 'scanned', provider: tier.label };
      }
      const reason = lowQuality ? 'low quality extraction' : 'no medicines extracted';
      if (lowQuality) console.warn(`  ⚠️ ${tier.label} result was low quality (${medicines.length} meds), falling back...`);
      errors.push(`${tier.label}: ${reason}`);
      await log.record(tier, started, false, reason);
    } catch (err) {
      const msg = scrubKey(err instanceof Error ? err.message : String(err), tier.key);
      console.warn(`  ❌ ${tier.label} Vision failed: ${msg}`);
      errors.push(`${tier.label}: ${msg}`);
      await log.record(tier, started, false, msg);
    }
  }

  await log.finish(chain.length ? 'No provider was available' : 'No image-capable AI provider configured');
  console.error(`🖼️ All vision tiers failed: ${errors.join(' | ')}`);
  return {
    medicines: [], pdfType: 'scanned', errorCode: 'AI_FAILED',
    errorMessage: chain.length
      ? `All vision APIs failed. ${errors[0] || 'Please try again later.'}`
      : 'No image-capable AI provider is configured.',
  };
}

// ─── runVisionPrompt: one image + a caller's prompt ───────────────────────────
/**
 * Send one image with a caller-supplied prompt through the same image-capable
 * chain as invoice vision (AI keys page instances + routing, daily limits,
 * AiCallLog). Returns the first reply `accept` takes, or null when every
 * provider failed or none is configured. The image stays in memory.
 */
export async function runVisionPrompt(
  imageBuffer: Buffer,
  mimeType: string,
  prompt: string,
  ctx: AiCallContext,
  accept: (content: string) => boolean
): Promise<{ content: string; provider: string } | null> {
  await loadAiKeys();
  const usage = await getDailyUsage();
  const chain = buildChain(ctx.feature).filter((tier) => tier.supportsImage);
  const log = attemptLogger(ctx);
  const data = imageBuffer.toString('base64');

  for (const tier of chain) {
    if (!tier.available(usage)) continue;
    const started = Date.now();
    try {
      const content = await tier.call({ user: prompt, timeoutMs: VISION_TIMEOUT_MS }, [{ mimeType, data }]);
      if (accept(content)) {
        await log.record(tier, started, true);
        await incrementUsage(tier.usageField);
        return { content, provider: tier.label };
      }
      await log.record(tier, started, false, 'unusable reply');
    } catch (err) {
      const msg = scrubKey(err instanceof Error ? err.message : String(err), tier.key);
      console.warn(`  ❌ ${tier.label} vision prompt failed: ${msg}`);
      await log.record(tier, started, false, msg);
    }
  }

  await log.finish(chain.length ? 'No provider was available' : 'No image-capable AI provider configured');
  return null;
}

// ─── Legacy export (kept for backward compatibility) ──────────────────────────
export async function parseMedicinesWithAI(rawOcrText: string, ctx: AiCallContext): Promise<ParseResult> {
  return parseTextWithAI(rawOcrText, ctx);
}
