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
const GEMINI_CHUNK_SIZE = 25000   // 2 chunks for ~50k char PDF
const CEREBRAS_CHUNK_SIZE = 8000  // 60k TPM — can handle larger chunks
const GROQ_CHUNK_SIZE = 7000    // 7 chunks
const CLOUDFLARE_CHUNK_SIZE = 6000   // Reduced chunk count
const MISTRAL_CHUNK_SIZE = 7000    // ~22 chunks for large PDFs
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
  {"name": "TRIPHALA CHURNA", "packing": "100GM", "hsn": "2106", "company": "AYUKALP", "batchNo": "DH558", "expiryDate": "Feb-28", "mrp": 112.50, "tradePrice": 90, "purchaseRate": 90}
]

RULES:
1. Medicine names: normalize to UPPER CASE
2. Extract ALL packing + price combinations — one record per variant
3. packing format: "200ML", "60TAB", "100GM", "1KG", "40TAB", "50GM", etc
4. For price lists: mrp and tradePrice are required. If only one price column, use it for both.
5. For invoices: extract batchNo, expiryDate (as printed e.g. "Feb-28"), hsn, company (Mfg By column), purchaseRate (PTS column), mrp. Set tradePrice = purchaseRate.
6. Return ONLY valid JSON array starting with '[' and ending with ']'. No markdown, no extra text.
7. Required fields always: name (string), packing (string), mrp (number), tradePrice (number)
8. Optional fields when available: company, hsn, batchNo, expiryDate, purchaseRate
9. Ignore headers, footers, page numbers, totals, tax lines, address lines, and non-medicine text
10. Extract ALL medicines — do not stop early or limit the count
11. NEVER extract disease names as medicine names (e.g. LEPROSY, ARTHRITIS, FEVER, PAIN are NOT medicines)
12. Medicine names are product brand names like 'TRIPHALA CHURNA', 'AROGYAVARDHINI VATI', 'ADULSA SYRUP'
13. Price sanity: MRP must be 1–10000. TradePrice must be ≤ MRP. Skip impossible prices.`

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
  const mrp = typeof item.mrp === 'number' ? item.mrp : Number(item.mrp)
  const tradePrice = typeof item.tradePrice === 'number' ? item.tradePrice : Number(item.tradePrice)
  if (!name || !packing || Number.isNaN(mrp) || Number.isNaN(tradePrice)) return null
  return { name, packing, mrp, tradePrice }
}

// Dedup removed — bulk-insert handles DB-level deduplication via upsert.
// Removing this ensures the frontend review screen shows all extracted medicines.
function dedup(medicines: ParsedMedicine[]): ParsedMedicine[] {
  return medicines;
}

function parseJsonSafely(text: string): ParsedMedicine[] {
  const jsonText = extractJsonArray(text)
  let parsed: any[]
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
  if (!Array.isArray(parsed)) throw new Error('AI response was not a JSON array')
  const medicines: ParsedMedicine[] = []
  for (const raw of parsed) {
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
  const OVERLAP_LINES = 2

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const potentialLength = currentChunk.length + line.length + (currentChunk ? 1 : 0)
    if (potentialLength > maxChars && currentChunk) {
      chunks.push(currentChunk)
      const overlapLines = currentChunk.split('\n').slice(-OVERLAP_LINES)
      currentChunk = overlapLines.join('\n')
    }
    currentChunk += (currentChunk ? '\n' : '') + line
  }
  if (currentChunk) chunks.push(currentChunk)
  return chunks
}

async function processChunks(
  chunks: string[],
  processFn: (chunk: string, index: number, total: number) => Promise<ParsedMedicine[]>,
  delayMs: number = REQUEST_INTERVAL_MS
): Promise<ParsedMedicine[]> {
  const allMedicines: ParsedMedicine[] = []
  for (let i = 0; i < chunks.length; i++) {
    const medicines = await processFn(chunks[i], i, chunks.length)
    allMedicines.push(...medicines)
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  return allMedicines
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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
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

async function parseTextWithGemini(text: string): Promise<ParseResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('NO_API_KEY');

  console.log('💎 Calling Gemini API (Text mode — 2 chunks)...');
  const chunks = splitTextIntoChunks(text, GEMINI_CHUNK_SIZE);
  console.log(`  Gemini: ${chunks.length} chunks`);

  const allMedicines = await processChunks(chunks, async (chunk, i, total) => {
    console.log(`  💎 Gemini chunk ${i + 1}/${total} (${chunk.length} chars)`);
    const payload = {
      contents: [{
        parts: [{ text: SYSTEM_PROMPT + `\n\nExtract medicines from this text. Return ONLY a JSON array:\n\n${chunk}` }]
      }],
      generationConfig: { temperature: 0 }
    };

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );

    if (resp.status === 429) { const err: any = new Error('RATE_LIMIT'); err.status = 429; throw err; }
    if (!resp.ok) throw new Error(`Gemini status ${resp.status}`);

    const data = await resp.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('Empty response from Gemini');
    return parseJsonSafely(content);
  });

  console.log(`💎 Gemini extracted ${allMedicines.length} medicines`);
  return { medicines: dedup(allMedicines), pdfType: 'scanned', provider: 'gemini' };
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
        max_tokens: 8192
      })
    });

    if (resp.status === 429) { const err: any = new Error('RATE_LIMIT'); err.status = 429; throw err; }
    if (!resp.ok) throw new Error(`Groq status ${resp.status}`);

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from Groq');
    return parseJsonSafely(content);
  }, 3000);

  console.log(`⚡ Groq extracted ${allMedicines.length} medicines`);
  return { medicines: dedup(allMedicines), pdfType, provider: 'groq' };
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
    if (!resp.ok) throw new Error(`Cerebras status ${resp.status}`);

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from Cerebras');
    return parseJsonSafely(content);
  }, 1000);

  console.log(`🧠 Cerebras extracted ${allMedicines.length} medicines`);
  return { medicines: dedup(allMedicines), pdfType, provider: 'cerebras' };
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

  console.log(`☁️ Cloudflare extracted ${allMedicines.length} medicines`);
  return { medicines: dedup(allMedicines), pdfType, provider: 'cloudflare' };
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

  console.log(`🌟 Mistral extracted ${allMedicines.length} medicines`);
  return { medicines: dedup(allMedicines), pdfType, provider: 'mistral' };
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
    if (process.env.GEMINI_API_KEY && usage.gemini < GEMINI_DAILY_LIMIT) {
      const result = await parseWithGemini(pdfBuffer);
      if (result.medicines.length > 0) { await incrementUsage('gemini'); return result; }
    } else if (usage.gemini >= GEMINI_DAILY_LIMIT) {
      console.log('Gemini daily limit reached. Skipping Tier 1.');
    }
  } catch (error: any) {
    if (error?.status === 429) console.log('Gemini rate limited, trying Groq...');
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

  // TIER 2 — Cerebras
  try {
    if (process.env.CEREBRAS_API_KEY && ((usage as any).cerebras ?? 0) < CEREBRAS_DAILY_LIMIT) {
      const result = await parseWithCerebras(extractedText, 'searchable');
      if (result.medicines.length > 0) { await incrementUsage('cerebras'); return result; }
    }
  } catch (error: any) {
    if (error?.status === 429) console.log('Cerebras rate limited, trying Groq...');
    else console.error('Cerebras error:', error?.message || error);
  }

  // TIER 3 — Groq
  try {
    if (process.env.GROQ_API_KEY && usage.groq < GROQ_DAILY_LIMIT) {
      const result = await parseTextWithGroq(extractedText, 'searchable');
      if (result.medicines.length > 0) { await incrementUsage('groq'); return result; }
    } else if (usage.groq >= GROQ_DAILY_LIMIT) {
      console.log('Groq daily limit reached. Skipping Tier 3.');
    }
  } catch (error: any) {
    if (error?.status === 429) console.log('Groq rate limited, trying Mistral...');
    else console.error('Groq error:', error?.message || error);
  }

  // TIER 4 — Mistral
  try {
    if (process.env.MISTRAL_API_KEY && usage.mistral < MISTRAL_DAILY_LIMIT) {
      const result = await parseWithMistral(extractedText, 'searchable');
      if (result.medicines.length > 0) { await incrementUsage('mistral'); return result; }
    } else if (usage.mistral >= MISTRAL_DAILY_LIMIT) {
      console.log('Mistral daily limit reached. Skipping Tier 3.');
    }
  } catch (error: any) {
    if (error?.status === 429) console.log('Mistral rate limited, trying Cloudflare...');
    else console.error('Mistral error:', error?.message || error);
  }

  // TIER 4 — Cloudflare
  try {
    if (process.env.CLOUDFLARE_API_TOKEN && usage.cloudflare < CLOUDFLARE_DAILY_LIMIT) {
      const result = await parseWithCloudflare(extractedText, 'searchable');
      if (result.medicines.length > 0) { await incrementUsage('cloudflare'); return result; }
    } else if (usage.cloudflare >= CLOUDFLARE_DAILY_LIMIT) {
      console.log('Cloudflare daily limit reached. Skipping Tier 4.');
    }
  } catch (error: any) {
    if (error?.status === 429) console.log('Cloudflare rate limited, trying OpenRouter...');
    else console.error('Cloudflare error:', error?.message || error);
  }

  // TIER 5 — OpenRouter
  try {
    if (process.env.OPENROUTER_API_KEY) {
      const result = await parseWithOpenRouter(extractedText, 'searchable');
      if (result.medicines.length > 0) { await incrementUsage('openrouter'); return result; }
    }
  } catch (error: any) {
    console.error('OpenRouter error:', error?.message || error);
  }

  return {
    medicines: [], pdfType: 'unknown', errorCode: 'AI_FAILED',
    errorMessage: 'All AI tiers failed. Please try again in a few minutes.',
  };
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
    if (process.env.GEMINI_API_KEY && usage.gemini < GEMINI_DAILY_LIMIT) {
      const result = await parseTextWithGemini(cleanedText);
      if (result.medicines.length > 0) { await incrementUsage('gemini'); return result; }
    } else if (usage.gemini >= GEMINI_DAILY_LIMIT) {
      console.log('Gemini daily limit reached. Skipping Tier 1.');
    }
  } catch (error: any) {
    if (error?.status === 429) console.log('Gemini rate limited, trying Groq...');
    else console.error('Gemini error:', error?.message || error);
  }

  // TIER 2 — Cerebras
  try {
    if (process.env.CEREBRAS_API_KEY && ((usage as any).cerebras ?? 0) < CEREBRAS_DAILY_LIMIT) {
      const result = await parseWithCerebras(cleanedText);
      if (result.medicines.length > 0) { await incrementUsage('cerebras'); return result; }
    }
  } catch (error: any) {
    if (error?.status === 429) console.log('Cerebras rate limited, trying Groq...');
    else console.error('Cerebras error:', error?.message || error);
  }

  // TIER 3 — Groq
  try {
    if (process.env.GROQ_API_KEY && usage.groq < GROQ_DAILY_LIMIT) {
      const result = await parseTextWithGroq(cleanedText);
      if (result.medicines.length > 0) { await incrementUsage('groq'); return result; }
    } else if (usage.groq >= GROQ_DAILY_LIMIT) {
      console.log('Groq daily limit reached. Skipping Tier 3.');
    }
  } catch (error: any) {
    if (error?.status === 429) console.log('Groq rate limited, trying Mistral...');
    else console.error('Groq error:', error?.message || error);
  }

  // TIER 4 — Mistral
  try {
    if (process.env.MISTRAL_API_KEY && usage.mistral < MISTRAL_DAILY_LIMIT) {
      const result = await parseWithMistral(cleanedText);
      if (result.medicines.length > 0) { await incrementUsage('mistral'); return result; }
    } else if (usage.mistral >= MISTRAL_DAILY_LIMIT) {
      console.log('Mistral daily limit reached. Skipping Tier 3.');
    }
  } catch (error: any) {
    if (error?.status === 429) console.log('Mistral rate limited, trying Cloudflare...');
    else console.error('Mistral error:', error?.message || error);
  }

  // TIER 4 — Cloudflare
  try {
    if (process.env.CLOUDFLARE_API_TOKEN && usage.cloudflare < CLOUDFLARE_DAILY_LIMIT) {
      const result = await parseWithCloudflare(cleanedText);
      if (result.medicines.length > 0) { await incrementUsage('cloudflare'); return result; }
    } else if (usage.cloudflare >= CLOUDFLARE_DAILY_LIMIT) {
      console.log('Cloudflare daily limit reached. Skipping Tier 4.');
    }
  } catch (error: any) {
    if (error?.status === 429) console.log('Cloudflare rate limited, trying OpenRouter...');
    else console.error('Cloudflare error:', error?.message || error);
  }

  // TIER 5 — OpenRouter
  try {
    if (process.env.OPENROUTER_API_KEY) {
      const result = await parseWithOpenRouter(cleanedText);
      if (result.medicines.length > 0) { await incrementUsage('openrouter'); return result; }
    }
  } catch (error: any) {
    console.error('OpenRouter error:', error?.message || error);
  }

  return {
    medicines: [], pdfType: 'scanned', errorCode: 'AI_FAILED',
    errorMessage: 'All AI tiers failed. Please try again in a few minutes.',
  };
}

// ─── Legacy export (kept for backward compatibility) ──────────────────────────
export async function parseMedicinesWithAI(rawOcrText: string): Promise<ParseResult> {
  return parseTextWithAI(rawOcrText);
}