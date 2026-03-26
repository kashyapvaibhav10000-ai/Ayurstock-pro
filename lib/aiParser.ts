import { prisma } from '@/lib/db';
const pdfParse = require('pdf-parse') as (buffer: Buffer, options?: any) => Promise<{ text: string; numpages: number }>;

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
  provider?: 'gemini' | 'cerebras' | 'groq' | 'cloudflare' | 'mistral' | 'openrouter';
  errorCode?: ParseErrorCode;
  errorMessage?: string;
}

// ─── Chunk sizes per tier (based on each API's limits) ───────────────────────
const GEMINI_CHUNK_SIZE = 500000  // always 1 chunk — Gemini has 1M token context
const CEREBRAS_CHUNK_SIZE = 4000  // smaller chunks to prevent JSON output truncation
const GROQ_CHUNK_SIZE = 5000    // smaller chunks for 70b model context limits
const CLOUDFLARE_CHUNK_SIZE = 6000   // Reduced chunk count
const MISTRAL_CHUNK_SIZE = 5000    // ~22 chunks for large PDFs
const OPENROUTER_CHUNK_SIZE = 3500   // 15 chunks

// ─── Cloudflare & Mistral config ─────────────────────────────────────────────
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 'c51d5cf5c7c78d123c5ce4404d9040b1'
const CF_MODEL = '@cf/meta/llama-3.2-3b-instruct'
const MISTRAL_MODEL = 'mistral-small-latest'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

const OPENROUTER_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'google/gemma-3-27b-it:free',
  'google/gemini-2.0-flash-lite-preview-02-05:free',
  'deepseek/deepseek-r1-distill-llama-70b:free',
]

const REQUEST_TIMEOUT_MS = 90000
const REQUEST_INTERVAL_MS = 1000   // 1s delay between chunks
const MAX_CONCURRENT = 1

// ─── Daily usage limits ───────────────────────────────────────────────────────
const GEMINI_DAILY_LIMIT = 1400
const CEREBRAS_DAILY_LIMIT = 50000  // Very generous free tier
const GROQ_DAILY_LIMIT = 14000
const CLOUDFLARE_DAILY_LIMIT = 10000
const MISTRAL_DAILY_LIMIT = 1000

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

// ─── Prisma usage tracking ────────────────────────────────────────────────────
async function getDailyUsage() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const record = await prisma.apiUsageCounter.findUnique({ where: { date: today } });
    return record || { gemini: 0, cerebras: 0, groq: 0, openrouter: 0, cloudflare: 0, mistral: 0 };
  } catch (e) {
    return { gemini: 0, cerebras: 0, groq: 0, openrouter: 0, cloudflare: 0, mistral: 0 };
  }
}

async function incrementUsage(provider: 'gemini' | 'cerebras' | 'groq' | 'cloudflare' | 'mistral' | 'openrouter') {
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
  
  return normalized
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
}

type TextTierConfig = {
  name: string;
  chunkSize: number;
  delayMs: number;
  available: () => boolean;
  processFn: (chunk: string, index: number, total: number) => Promise<ParsedMedicine[]>;
}

async function relayParseText(
  text: string,
  tiers: TextTierConfig[],
  pdfType: PdfType = 'searchable'
): Promise<ParseResult> {
  let remainingText = text
  const allMedicines: ParsedMedicine[] = []
  const usedProviders: string[] = []

  for (const tier of tiers) {
    if (!remainingText.trim() || remainingText.trim().length < 50) {
      console.log('  ✅ No remaining text. Relay complete.')
      break
    }

    if (!tier.available()) {
      console.log(`  ⏭️ ${tier.name}: not available, skipping.`)
      continue
    }

    try {
      console.log(`\n🔗 Relay → ${tier.name} (${remainingText.length} chars remaining)`);
      const chunks = splitTextIntoChunks(remainingText, tier.chunkSize)
      console.log(`  ${tier.name}: ${chunks.length} chunks`)

      const result = await processChunks(chunks, tier.processFn, tier.delayMs)
      allMedicines.push(...result.medicines)

      if (result.medicines.length > 0) {
        usedProviders.push(tier.name)
        await incrementUsage(tier.name as any)
      }

      if (!result.rateLimited) {
        console.log(`  ✅ ${tier.name} completed all ${result.totalChunks} chunks. Total: ${allMedicines.length} medicines.`)
        break
      }

      const unprocessedChunks = chunks.slice(result.completedChunks)
      remainingText = unprocessedChunks.join('\n')
      console.log(`  🔄 ${tier.name} completed ${result.completedChunks}/${result.totalChunks} chunks (${result.medicines.length} medicines). Relaying ${remainingText.length} chars to next tier...`)

    } catch (error: any) {
      console.error(`  ❌ ${tier.name} error: ${error?.message || error}`)
    }
  }

  if (allMedicines.length === 0) {
    return { medicines: [], pdfType, errorCode: 'AI_FAILED', errorMessage: 'All AI tiers failed.' }
  }

  console.log(`\n🏁 Relay complete! ${allMedicines.length} total medicines from [${usedProviders.join(' → ')}]`)
  return { medicines: dedup(allMedicines), pdfType, provider: usedProviders[0] as any }
}

async function processChunks(
  chunks: string[],
  processFn: (chunk: string, index: number, total: number) => Promise<ParsedMedicine[]>,
  delayMs: number = REQUEST_INTERVAL_MS
): Promise<ChunkResult> {
  const allMedicines: ParsedMedicine[] = []
  let completedChunks = 0
  let rateLimited = false
  for (let i = 0; i < chunks.length; i++) {
    try {
      const medicines = await processFn(chunks[i], i, chunks.length)
      allMedicines.push(...medicines)
      completedChunks++
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err)
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
  return { medicines: allMedicines, completedChunks, totalChunks: chunks.length, rateLimited }
}

// ─── TIER 1: Gemini ───────────────────────────────────────────────────────────
async function parseWithGemini(pdfBuffer: Buffer): Promise<ParseResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('NO_API_KEY');

  const base64Pdf = pdfBuffer.toString('base64');
  console.log('💎 Calling Gemini API (PDF mode — whole document)...');

  const payload = {
    contents: [{
      parts: [
        { inlineData: { mimeType: "application/pdf", data: base64Pdf } },
        { text: SYSTEM_PROMPT + "\n\nExtract medicines from this PDF. Return ONLY valid JSON array." }
      ]
    }],
    generationConfig: { temperature: 0 }
  };

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  );

  if (resp.status === 429) { const err: any = new Error('RATE_LIMIT'); err.status = 429; throw err; }
  if (!resp.ok) throw new Error(`Gemini status ${resp.status}`);

  const data = await resp.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Empty response from Gemini');

  const medicines = parseJsonSafely(content);
  console.log(`💎 Gemini extracted ${medicines.length} medicines`);
  return { medicines: dedup(medicines), pdfType: 'searchable', provider: 'gemini' };
}

// ─── Gemini Vision: Parse images directly ─────────────────────────────────────
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
      "company": "AYUKALP"
    }
  ]
}

Return ONLY valid JSON. NO explanation. NO markdown.`;

export async function parseImageWithGeminiVision(imageBuffer: Buffer, mimeType: string): Promise<ParseResult> {
  const base64Image = imageBuffer.toString('base64');
  const errors: string[] = [];

  // ── TIER 1: Gemini Vision ────────────────────────────────────────────
  if (process.env.GEMINI_API_KEY) {
    try {
      console.log(`🖼️ [Tier 1] Gemini Vision (${imageBuffer.length} bytes)...`);
      const result = await callGeminiVision(base64Image, mimeType);
      if (result.medicines.length > 0) return result;
      errors.push('Gemini: no medicines extracted');
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.warn(`  ❌ Gemini Vision failed: ${msg}`);
      errors.push(`Gemini: ${msg}`);
    }
  } else {
    errors.push('Gemini: no API key');
  }

  // ── TIER 2: Groq Vision ──────────────────────────────────────────────
  if (process.env.GROQ_API_KEY) {
    try {
      console.log(`🖼️ [Tier 2] Groq Vision...`);
      const result = await callGroqVision(base64Image, mimeType);
      
      // QUALITY CHECK: If more than 40% of rows have "NA" batch/qty, it's low quality
      const lowQuality = result.medicines.filter(m => !m.batchNo || m.batchNo === 'NA' || !m.quantity).length / (result.medicines.length || 1) > 0.4;
      
      if (result.medicines.length > 0 && !lowQuality) return result;
      console.warn(`  ⚠️ Groq result was low quality (${result.medicines.length} meds), falling back to Tier 3...`);
      errors.push('Groq: low quality extraction');
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.warn(`  ❌ Groq Vision failed: ${msg}`);
      errors.push(`Groq: ${msg}`);
    }
  } else {
    errors.push('Groq: no API key');
  }

  // ── TIER 3: OpenRouter Vision ────────────────────────────────────────
  if (process.env.OPENROUTER_API_KEY) {
    try {
      console.log(`🖼️ [Tier 3] OpenRouter Vision...`);
      const result = await callOpenRouterVision(base64Image, mimeType);
      if (result.medicines.length > 0) return result;
      errors.push('OpenRouter: no medicines extracted');
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.warn(`  ❌ OpenRouter Vision failed: ${msg}`);
      errors.push(`OpenRouter: ${msg}`);
    }
  } else {
    errors.push('OpenRouter: no API key');
  }

  console.error(`🖼️ All vision tiers failed: ${errors.join(' | ')}`);
  return {
    medicines: [], pdfType: 'scanned', errorCode: 'AI_FAILED',
    errorMessage: `All vision APIs failed. ${errors[0] || 'Please try again later.'}`,
  };
}

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

async function callGeminiVision(base64Image: string, mimeType: string): Promise<ParseResult> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType, data: base64Image } },
            { text: INVOICE_IMAGE_PROMPT }
          ]}],
          generationConfig: { temperature: 0 }
        }),
        signal: controller.signal
      }
    );

    if (resp.status === 429) throw new Error('RATE_LIMIT');
    if (!resp.ok) throw new Error(`Status ${resp.status}`);

    const data = await resp.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log(`🖼️ Gemini raw (first 300): ${(content || '').substring(0, 300)}`);
    if (!content) throw new Error('Empty response');

    const rawMedicines = parseJsonSafely(content);
    const medicines = normalizeMedicines(rawMedicines);
    logExtractedMedicines(medicines, 'Gemini');
    await incrementUsage('gemini');
    return { medicines: dedup(medicines), pdfType: 'scanned', provider: 'gemini' };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGroqVision(base64Image: string, mimeType: string): Promise<ParseResult> {
  const apiKey = process.env.GROQ_API_KEY!;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  // Try multiple Groq vision models in order
  const groqVisionModels = [
    'llama-3.3-70b-versatile',
    'meta-llama/llama-4-scout-17b-16e-instruct',
  ];

  for (const model of groqVisionModels) {
  try {
    console.log(`  🔄 Groq trying ${model}...`);
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
              { type: 'text', text: INVOICE_IMAGE_PROMPT }
            ]
          }
        ],
        temperature: 0,
        max_tokens: 4096
      }),
      signal: controller.signal
    });

    if (resp.status === 429) throw new Error('RATE_LIMIT');
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.warn(`  ⚠️ Groq ${model}: Status ${resp.status}: ${body.substring(0, 100)}`);
      continue;
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    console.log(`🖼️ Groq Vision (${model}) raw (first 300): ${(content || '').substring(0, 300)}`);
    if (!content) { console.warn(`  ⚠️ Groq ${model}: empty response`); continue; }

    const rawMedicines = parseJsonSafely(content);
    const medicines = normalizeMedicines(rawMedicines);
    logExtractedMedicines(medicines, `Groq/${model}`);
    await incrementUsage('groq');
    return { medicines: dedup(medicines), pdfType: 'scanned', provider: 'groq' };
  } catch (err: any) {
    console.warn(`  ❌ Groq ${model}: ${err?.message || err}`);
    if (err?.message === 'RATE_LIMIT') throw err;
  }
  } // end for loop

  clearTimeout(timeoutId);
  throw new Error('All Groq vision models failed');
}

async function callOpenRouterVision(base64Image: string, mimeType: string): Promise<ParseResult> {
  const apiKey = process.env.OPENROUTER_API_KEY!;
  const visionModels = [
    'google/gemini-2.0-flash-001',
    'google/gemini-2.0-flash-lite-001',
    'anthropic/claude-3.5-sonnet:beta',
    'google/gemma-3-27b-it:free',
    'mistralai/mistral-small-3.1-24b-instruct:free',
  ];

  for (const model of visionModels) {
    try {
      console.log(`  🔄 OpenRouter trying ${model}...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      try {
        const resp = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
                  { type: 'text', text: INVOICE_IMAGE_PROMPT }
                ]
              }
            ],
            temperature: 0,
            max_tokens: 4096
          }),
          signal: controller.signal
        });

        if (resp.status === 429) { console.warn(`  ⚠️ ${model}: rate limited`); continue; }
        if (!resp.ok) { console.warn(`  ⚠️ ${model}: status ${resp.status}`); continue; }

        const data = await resp.json();
        if (data?.error) { console.warn(`  ⚠️ ${model}: ${data.error.message?.substring(0, 80)}`); continue; }

        const content = data?.choices?.[0]?.message?.content;
        console.log(`🖼️ OpenRouter (${model}) raw (first 300): ${(content || '').substring(0, 300)}`);
        if (!content) continue;

        const rawMedicines = parseJsonSafely(content);
        const medicines = normalizeMedicines(rawMedicines);
        if (medicines.length > 0) {
          logExtractedMedicines(medicines, `OpenRouter/${model}`);
          await incrementUsage('openrouter');
          return { medicines: dedup(medicines), pdfType: 'scanned', provider: 'openrouter' };
        }
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      console.warn(`  ❌ OpenRouter ${model}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error('All OpenRouter vision models failed');
}

async function parseTextWithGemini(text: string): Promise<ParseResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('NO_API_KEY');

  console.log(`💎 Calling Gemini API (Text mode)...`);
  const chunks = splitTextIntoChunks(text, GEMINI_CHUNK_SIZE);
  console.log(`  Gemini: ${chunks.length} chunk(s)`);

  const allMedicines = await processChunks(chunks, async (chunk, i, total) => {
    console.log(`  💎 Gemini chunk ${i + 1}/${total} (${chunk.length} chars)`);
    const payload = {
      contents: [{
        parts: [{ text: SYSTEM_PROMPT + `\n\nExtract medicines from this text. Return ONLY a JSON array:\n\n${chunk}` }]
      }],
      generationConfig: { temperature: 0 }
    };

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );

    if (resp.status === 429) { const err: any = new Error('RATE_LIMIT'); err.status = 429; throw err; }
    if (!resp.ok) throw new Error(`Gemini status ${resp.status}`);

    const data = await resp.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('Empty response from Gemini');
    return parseJsonSafely(content);
  });

  console.log(`💎 Gemini extracted ${allMedicines.medicines.length} medicines`);
  return { medicines: dedup(allMedicines.medicines), pdfType: 'scanned', provider: 'gemini' };
}

// ─── TIER 2: Groq ─────────────────────────────────────────────────────────────
async function parseWithGroq(pdfBuffer: Buffer): Promise<ParseResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('NO_API_KEY');

  let text = '';
  try {
    const pdfData = await pdfParse(pdfBuffer, { max: 100 });
    text = pdfData.text;
  } catch (e) {
    throw new Error('NO_TEXT');
  }
  if (!text || text.trim().length < 50) throw new Error('NO_TEXT');

  return parseTextWithGroq(text, 'searchable');
}

async function parseTextWithGroq(text: string, pdfType: PdfType = 'scanned'): Promise<ParseResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('NO_API_KEY');
  if (!text || text.trim().length < 50) throw new Error('NO_TEXT');

  console.log('⚡ Calling Groq API...');
  const chunks = splitTextIntoChunks(text, GROQ_CHUNK_SIZE);
  console.log(`  Groq: ${chunks.length} chunks`);

  const allMedicines = await processChunks(chunks, async (chunk, i, total) => {
    console.log(`  ⚡ Groq chunk ${i + 1}/${total} (${chunk.length} chars)`);
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Extract medicines from this text. Return ONLY JSON array:\n\n${chunk}` }
        ],
        temperature: 0,
        max_tokens: 4096
      })
    });

    if (resp.status === 429) { const err: any = new Error('RATE_LIMIT'); err.status = 429; throw err; }
    if (!resp.ok) {
      const errorBody = await resp.text().catch(() => '');
      console.error(`Groq error body: ${errorBody.substring(0, 200)}`);
      throw new Error(`Groq status ${resp.status}`);
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from Groq');
    return parseJsonSafely(content);
  }, 3000);

  console.log(`⚡ Groq extracted ${allMedicines.medicines.length} medicines`);
  return { medicines: dedup(allMedicines.medicines), pdfType, provider: 'groq' };
}

// ─── TIER 2b: Cerebras ────────────────────────────────────────────────────────
async function parseWithCerebras(text: string, pdfType: PdfType = 'scanned'): Promise<ParseResult> {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) throw new Error('NO_API_KEY');
  if (!text || text.trim().length < 50) throw new Error('NO_TEXT');

  console.log('🧠 Calling Cerebras API...');
  const chunks = splitTextIntoChunks(text, CEREBRAS_CHUNK_SIZE);
  console.log(`  Cerebras: ${chunks.length} chunks`);

  const allMedicines = await processChunks(chunks, async (chunk, i, total) => {
    console.log(`  🧠 Cerebras chunk ${i + 1}/${total} (${chunk.length} chars)`);
    const resp = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama3.1-8b',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Extract medicines from this text. Return ONLY JSON array:\n\n${chunk}` }
        ],
        temperature: 0,
        max_tokens: 8192
      })
    });

    if (resp.status === 429) { const err: any = new Error('RATE_LIMIT'); err.status = 429; throw err; }
    if (!resp.ok) {
      const errorBody = await resp.text().catch(() => '');
      console.error(`Cerebras error body: ${errorBody.substring(0, 200)}`);
      throw new Error(`Cerebras status ${resp.status}`);
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from Cerebras');
    return parseJsonSafely(content);
  }, 1000);

  console.log(`🧠 Cerebras extracted ${allMedicines.medicines.length} medicines`);
  return { medicines: dedup(allMedicines.medicines), pdfType, provider: 'cerebras' };
}

// ─── TIER 3: Cloudflare AI ────────────────────────────────────────────────────
async function parseWithCloudflare(text: string, pdfType: PdfType = 'scanned'): Promise<ParseResult> {
  const apiKey = process.env.CLOUDFLARE_API_TOKEN;
  if (!apiKey) throw new Error('NO_API_KEY');

  console.log('☁️ Calling Cloudflare Workers AI...');
  const chunks = splitTextIntoChunks(text, CLOUDFLARE_CHUNK_SIZE);
  console.log(`  Cloudflare: ${chunks.length} chunks`);

  const allMedicines = await processChunks(chunks, async (chunk, i, total) => {
    console.log(`  ☁️ Cloudflare chunk ${i + 1}/${total} (${chunk.length} chars)`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const resp = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: `Extract medicines from this text. Return ONLY JSON array:\n\n${chunk}` }
            ],
            max_tokens: 2048
          }),
          signal: controller.signal
        }
      );

      if (resp.status === 429) { const err: any = new Error('RATE_LIMIT'); err.status = 429; throw err; }
      if (!resp.ok) throw new Error(`Cloudflare status ${resp.status}`);

      const data = await resp.json();
      const content = data?.result?.response || '';
      if (!content) throw new Error('Empty response from Cloudflare');
      return parseJsonSafely(content);
    } finally {
      clearTimeout(timeoutId);
    }
  });

  console.log(`☁️ Cloudflare extracted ${allMedicines.medicines.length} medicines`);
  return { medicines: dedup(allMedicines.medicines), pdfType, provider: 'cloudflare' };
}

// ─── TIER 4: Mistral AI ───────────────────────────────────────────────────────
async function parseWithMistral(text: string, pdfType: PdfType = 'scanned'): Promise<ParseResult> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('NO_API_KEY');

  console.log('🌟 Calling Mistral AI...');
  const chunks = splitTextIntoChunks(text, MISTRAL_CHUNK_SIZE);
  console.log(`  Mistral: ${chunks.length} chunks`);

  const allMedicines = await processChunks(chunks, async (chunk, i, total) => {
    console.log(`  🌟 Mistral chunk ${i + 1}/${total} (${chunk.length} chars)`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const resp = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: MISTRAL_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Extract medicines from this text. Return ONLY JSON array:\n\n${chunk}` }
          ],
          temperature: 0,
          max_tokens: 8192
        }),
        signal: controller.signal
      });

      if (resp.status === 429) { const err: any = new Error('RATE_LIMIT'); err.status = 429; throw err; }
      if (!resp.ok) throw new Error(`Mistral status ${resp.status}`);

      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty response from Mistral');
      return parseJsonSafely(content);
    } finally {
      clearTimeout(timeoutId);
    }
  });

  console.log(`🌟 Mistral extracted ${allMedicines.medicines.length} medicines`);
  return { medicines: dedup(allMedicines.medicines), pdfType, provider: 'mistral' };
}

// ─── TIER 5: OpenRouter ───────────────────────────────────────────────────────
async function findWorkingOpenRouterModel(apiKey: string): Promise<string> {
  console.log('🔍 Finding working OpenRouter model...');
  for (const model of OPENROUTER_MODELS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Reply with the single word: Working' }],
          temperature: 0,
          max_tokens: 5,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await resp.json().catch(() => null);
      if (data?.error) { console.log(`  ❌ ${model}: ${(data.error.message || '').substring(0, 80)}`); continue; }
      const content = data?.choices?.[0]?.message?.content || '';
      if (content) { console.log(`  ✅ ${model}: working!`); return model; }
      console.log(`  ❌ ${model}: empty response`);
    } catch {
      console.log(`  ❌ ${model}: timeout or error`);
    }
  }
  throw new Error('No OpenRouter models are currently available.');
}

async function parseWithOpenRouter(text: string, pdfType: PdfType = 'scanned'): Promise<ParseResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('NO_API_KEY');

  console.log('🔄 Calling OpenRouter...');
  const workingModel = await findWorkingOpenRouterModel(apiKey);
  const chunks = splitTextIntoChunks(text, OPENROUTER_CHUNK_SIZE);
  console.log(`  OpenRouter: ${chunks.length} chunks with ${workingModel}`);

  const allMedicines: ParsedMedicine[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      console.log(`  🔄 OpenRouter chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const resp = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: workingModel,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: chunk }
            ],
            temperature: 0,
            max_tokens: 4096
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        if (resp.status === 429) throw new Error('RATE_LIMIT');
        if (!resp.ok) throw new Error(`OpenRouter status ${resp.status}`);

        const data = await resp.json();
        const content = data?.choices?.[0]?.message?.content || '';
        if (!content) throw new Error('Empty response from OpenRouter');

        const medicines = parseJsonSafely(content);
        allMedicines.push(...medicines);
        successCount++;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      console.warn(`  ❌ OpenRouter chunk ${i + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
      failureCount++;
    }

    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, REQUEST_INTERVAL_MS));
    }
  }

  console.log(`🔄 OpenRouter: ${successCount} succeeded, ${failureCount} failed`);
  if (successCount === 0) throw new Error('All OpenRouter chunks failed');

  return { medicines: dedup(allMedicines), pdfType, provider: 'openrouter' };
}

// ─── Extract text from PDF for lower tiers ────────────────────────────────────
async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  // Try pdf-parse first
  try {
    const pdfData = await pdfParse(pdfBuffer, { max: 100 });
    if (pdfData.text && pdfData.text.trim().length > 50) {
      return pdfData.text;
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

// ─── MAIN: parsePDFWithAI ─────────────────────────────────────────────────────
export async function parsePDFWithAI(pdfBuffer: Buffer): Promise<ParseResult> {
  console.log('\n📖 Starting 5-Tier PDF parsing sequence...');
  const usage = await getDailyUsage();

  // TIER 1 — Gemini (sends whole PDF natively)
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.log('⚠️ GEMINI_API_KEY not found in environment. Skipping Gemini.');
    } else if (usage.gemini >= GEMINI_DAILY_LIMIT) {
      console.log('Gemini daily limit reached. Skipping Tier 1.');
    } else {
      const result = await parseWithGemini(pdfBuffer);
      if (result.medicines.length > 0) { await incrementUsage('gemini'); return result; }
    }
  } catch (error: any) {
    if (error?.status === 429) console.log('Gemini rate limited, trying next tier...');
    else console.error('Gemini error:', error?.message || error);
  }

  // Extract text for Tiers 2-5
  console.log('🔧 Extracting text from PDF for lower tiers...');
  const extractedText = await extractTextFromPDF(pdfBuffer);

  if (!extractedText.trim()) {
    return {
      medicines: [], pdfType: 'scanned', errorCode: 'NO_TEXT',
      errorMessage: 'This PDF appears to be scanned/image-based. Use the "Run OCR" button.',
    };
  }

  console.log(`📊 Extracted ${extractedText.length} chars from PDF`);

  // ─── RELAY MODE: Tiers 2-5 share remaining text ───────────────────
  const usage2 = await getDailyUsage(); // refresh usage
  return relayParseText(extractedText, buildTextTiers(usage2), 'searchable');
}

// ─── Build tier configs ───────────────────────────────────────────────────────
function buildTextTiers(usage: any): TextTierConfig[] {
  // Mistral first — best quality (2100+ medicines vs 1200 from Cerebras)
  return [
    {
      name: 'mistral',
      chunkSize: MISTRAL_CHUNK_SIZE,
      delayMs: REQUEST_INTERVAL_MS,
      available: () => !!(process.env.MISTRAL_API_KEY && usage.mistral < MISTRAL_DAILY_LIMIT),
      processFn: async (chunk, i, total) => {
        console.log(`  🌟 Mistral chunk ${i + 1}/${total} (${chunk.length} chars)`);
        const apiKey = process.env.MISTRAL_API_KEY!;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
          const resp = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: MISTRAL_MODEL,
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: `Extract medicines from this text. Return ONLY JSON array:\n\n${chunk}` }
              ],
              temperature: 0, max_tokens: 8192
            }),
            signal: controller.signal
          });
          if (resp.status === 429) { const err: any = new Error('RATE_LIMIT'); err.status = 429; throw err; }
          if (!resp.ok) throw new Error(`Mistral status ${resp.status}`);
          const data = await resp.json();
          const content = data?.choices?.[0]?.message?.content;
          if (!content) throw new Error('Empty response');
          return parseJsonSafely(content);
        } finally { clearTimeout(timeoutId); }
      }
    },
    {
      name: 'cerebras',
      chunkSize: CEREBRAS_CHUNK_SIZE,
      delayMs: 1000,
      available: () => !!(process.env.CEREBRAS_API_KEY && ((usage as any).cerebras ?? 0) < CEREBRAS_DAILY_LIMIT),
      processFn: async (chunk, i, total) => {
        console.log(`  🧠 Cerebras chunk ${i + 1}/${total} (${chunk.length} chars)`);
        const apiKey = process.env.CEREBRAS_API_KEY!;
        const resp = await fetch('https://api.cerebras.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'llama3.1-8b',
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: `Extract medicines from this text. Return ONLY JSON array:\n\n${chunk}` }
            ],
            temperature: 0, max_tokens: 8192
          })
        });
        if (resp.status === 429) { const err: any = new Error('RATE_LIMIT'); err.status = 429; throw err; }
        if (!resp.ok) { const b = await resp.text().catch(() => ''); console.error(`Cerebras error body: ${b.substring(0, 200)}`); throw new Error(`Cerebras status ${resp.status}`); }
        const data = await resp.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content) throw new Error('Empty response');
        return parseJsonSafely(content);
      }
    },
    {
      name: 'groq',
      chunkSize: GROQ_CHUNK_SIZE,
      delayMs: 3000,
      available: () => !!(process.env.GROQ_API_KEY && usage.groq < GROQ_DAILY_LIMIT),
      processFn: async (chunk, i, total) => {
        console.log(`  ⚡ Groq chunk ${i + 1}/${total} (${chunk.length} chars)`);
        const apiKey = process.env.GROQ_API_KEY!;
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: `Extract medicines from this text. Return ONLY JSON array:\n\n${chunk}` }
            ],
            temperature: 0, max_tokens: 4096
          })
        });
        if (resp.status === 429) { const err: any = new Error('RATE_LIMIT'); err.status = 429; throw err; }
        if (!resp.ok) { const b = await resp.text().catch(() => ''); console.error(`Groq error body: ${b.substring(0, 200)}`); throw new Error(`Groq status ${resp.status}`); }
        const data = await resp.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content) throw new Error('Empty response');
        return parseJsonSafely(content);
      }
    },
    {
      name: 'cloudflare',
      chunkSize: CLOUDFLARE_CHUNK_SIZE,
      delayMs: REQUEST_INTERVAL_MS,
      available: () => !!(process.env.CLOUDFLARE_API_TOKEN && usage.cloudflare < CLOUDFLARE_DAILY_LIMIT),
      processFn: async (chunk, i, total) => {
        console.log(`  ☁️ Cloudflare chunk ${i + 1}/${total} (${chunk.length} chars)`);
        const apiKey = process.env.CLOUDFLARE_API_TOKEN!;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
          const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: `Extract medicines from this text. Return ONLY JSON array:\n\n${chunk}` }
              ],
              max_tokens: 2048
            }),
            signal: controller.signal
          });
          if (resp.status === 429) { const err: any = new Error('RATE_LIMIT'); err.status = 429; throw err; }
          if (!resp.ok) throw new Error(`Cloudflare status ${resp.status}`);
          const data = await resp.json();
          const content = data?.result?.response || '';
          if (!content) throw new Error('Empty response');
          return parseJsonSafely(content);
        } finally { clearTimeout(timeoutId); }
      }
    },
    {
      name: 'openrouter',
      chunkSize: OPENROUTER_CHUNK_SIZE,
      delayMs: REQUEST_INTERVAL_MS,
      available: () => !!process.env.OPENROUTER_API_KEY,
      processFn: async (chunk, i, total) => {
        console.log(`  🔄 OpenRouter chunk ${i + 1}/${total} (${chunk.length} chars)`);
        const apiKey = process.env.OPENROUTER_API_KEY!;
        const model = await findWorkingOpenRouterModel(apiKey);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
          const resp = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: chunk }
              ],
              temperature: 0, max_tokens: 4096
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (resp.status === 429) throw new Error('RATE_LIMIT');
          if (!resp.ok) throw new Error(`OpenRouter status ${resp.status}`);
          const data = await resp.json();
          const content = data?.choices?.[0]?.message?.content || '';
          if (!content) throw new Error('Empty response');
          return parseJsonSafely(content);
        } finally { clearTimeout(timeoutId); }
      }
    }
  ];
}

// ─── MAIN: parseTextWithAI ────────────────────────────────────────────────────
export async function parseTextWithAI(extractedText: string): Promise<ParseResult> {
  console.log('\n📖 Starting 5-Tier TEXT parsing sequence...');
  if (!extractedText.trim()) {
    return { medicines: [], pdfType: 'scanned', errorCode: 'NO_TEXT', errorMessage: 'The provided text is empty.' };
  }

  const usage = await getDailyUsage();
  const cleanedText = cleanOcrText(extractedText);

  // TIER 1 — Gemini
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.log('⚠️ GEMINI_API_KEY not found in environment. Skipping Gemini.');
    } else if (usage.gemini >= GEMINI_DAILY_LIMIT) {
      console.log('Gemini daily limit reached. Skipping Tier 1.');
    } else {
      const result = await parseTextWithGemini(cleanedText);
      if (result.medicines.length > 0) { await incrementUsage('gemini'); return result; }
    }
  } catch (error: any) {
    if (error?.status === 429) console.log('Gemini rate limited, trying next tier...');
    else console.error('Gemini error:', error?.message || error);
  }

  // ─── RELAY MODE: Tiers 2-5 share remaining text ───────────────────
  const usage2 = await getDailyUsage(); // refresh usage
  return relayParseText(cleanedText, buildTextTiers(usage2), 'scanned');
}

// ─── Legacy export (kept for backward compatibility) ──────────────────────────
export async function parseMedicinesWithAI(rawOcrText: string): Promise<ParseResult> {
  return parseTextWithAI(rawOcrText);
}

