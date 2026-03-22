import { prisma } from '@/lib/db';
const pdfParse = require('pdf-parse') as (buffer: Buffer, options?: any) => Promise<{ text: string; numpages: number }>;

export type ParsedMedicine = {
  name: string
  packing: string
  mrp: number
  tradePrice: number
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
  provider?: 'gemini' | 'groq' | 'openrouter';
  errorCode?: ParseErrorCode;
  errorMessage?: string;
}

async function getDailyUsage() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const record = await prisma.apiUsageCounter.findUnique({ where: { date: today } });
    return record || { gemini: 0, groq: 0, openrouter: 0 };
  } catch (e) {
    return { gemini: 0, groq: 0, openrouter: 0 };
  }
}

async function incrementUsage(provider: 'gemini' | 'groq' | 'openrouter') {
  try {
    const today = new Date().toISOString().split('T')[0];
    await prisma.apiUsageCounter.upsert({
      where: { date: today },
      update: { [provider]: { increment: 1 } },
      create: { date: today, [provider]: 1 }
    });
  } catch (e) { }
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

// FIX 1: Curated list of models known to handle JSON output reliably.
// Removed gemini-2.5-flash:free (no endpoints) and arcee-ai (truncates JSON).
const MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'google/gemma-3-27b-it:free',
  'google/gemini-2.0-flash-lite-preview-02-05:free',
  'deepseek/deepseek-r1-distill-llama-70b:free',
]

const MAX_CONCURRENT_REQUESTS = 1
// FIX 2: Reduced from 15000ms to 2000ms — we are self-hosted, no Cloudflare 100s timeout.
const REQUEST_INTERVAL_MS = 2000
const REQUEST_TIMEOUT_MS = 90000
// FIX 3: Reduced chunk size from 12000 to 3500 chars.
// Free models have small output windows (~1000-2000 tokens).
// Smaller chunks = complete JSON responses, no more "Unterminated string" errors.
const CHUNK_SIZE_CHARS = 3500

const SYSTEM_PROMPT = `You are a pharmacy data parser for Ayurvedic/herbal distributor price lists.
The text may come from OCR (scanned documents) so expect noise, typos, and formatting issues.

IMPORTANT: One medicine can have multiple packing sizes with different prices.
Create separate records for EACH packing variant.

EXAMPLE INPUT:
"ADULSA SYRUP   200ML   104.00   130   400ML   192.00   240"

EXPECTED OUTPUT:
[
  {"name": "ADULSA SYRUP", "packing": "200ML", "mrp": 130, "tradePrice": 104},
  {"name": "ADULSA SYRUP", "packing": "400ML", "mrp": 240, "tradePrice": 192}
]

RULES:
1. Medicine names may be ALL CAPS, Title Case, or mixed — normalize to UPPER CASE in output
2. Extract ALL packing + price combinations for each medicine
3. Return separate record for EACH variant, NOT combined
4. packing format: "200ML", "60TAB", "100GM", "1KG", etc
5. Prices are EXACT numbers from list (mrp and tradePrice). If only one price column exists, use it for both mrp and tradePrice.
6. Return ONLY valid JSON array. DO NOT output any markdown blocks, preambles, comments, or extra text. Start directly with '[' and end with ']'.
7. Each item MUST have: name (string), packing (string), mrp (number), tradePrice (number)
8. Ignore headers, footers, page numbers, totals, and non-medicine text
9. If text is noisy or unclear, extract whatever medicines you can confidently identify
10. CRITICAL: Keep your response SHORT. Only output the JSON array, nothing else. Max 30 items per response.`

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

class RateLimiter {
  private activeRequests = 0;
  private queue: Array<() => void> = [];

  constructor(
    private maxConcurrent: number,
    private delayBetweenMs: number
  ) { }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    while (this.activeRequests >= this.maxConcurrent) {
      await new Promise<void>(resolve => this.queue.push(resolve));
    }
    this.activeRequests++;
    try {
      const result = await fn();
      await new Promise<void>(resolve => setTimeout(resolve, this.delayBetweenMs));
      return result;
    } finally {
      this.activeRequests--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
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
      const currentLines = currentChunk.split('\n')
      const overlapLines = currentLines.slice(-OVERLAP_LINES)
      currentChunk = overlapLines.join('\n')
    }
    currentChunk += (currentChunk ? '\n' : '') + line
  }
  if (currentChunk) chunks.push(currentChunk)
  return chunks
}

// FIX 4: Simplified findWorkingModel — no longer probes 27 models one by one.
// Just uses the curated MODELS list above with a quick 5s ping each.
async function findWorkingModel(apiKey: string): Promise<string> {
  console.log('🔍 Finding a working OpenRouter model from curated list...');

  for (const model of MODELS) {
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

      if (data?.error) {
        console.log(`  ❌ ${model}: ${(data.error.message || '').substring(0, 80)}`);
        continue;
      }

      const content = data?.choices?.[0]?.message?.content || '';
      if (content) {
        console.log(`  ✅ ${model}: working!`);
        return model;
      }
      console.log(`  ❌ ${model}: empty response`);
    } catch {
      console.log(`  ❌ ${model}: timeout or error`);
    }
  }

  throw new Error('No AI models are currently available. Please try again in a few minutes.');
}

async function parseChunkWithAILogic(chunk: string, apiKey: string, model: string): Promise<ParsedMedicine[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    console.log(`📤 [${model}] Sending chunk (${chunk.length} chars)`);
    const resp = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: chunk },
        ],
        temperature: 0,
        // FIX 5: max_tokens raised to 4096 to avoid truncation mid-JSON.
        // Smaller chunks mean fewer items per response, so 4096 is plenty.
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });

    const status = resp.status;
    const responseText = await resp.text().catch(() => '');

    if (status === 429) throw new Error('RATE_LIMIT');

    let data: any = null;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error('AI returned invalid JSON response');
    }

    if (data?.error) {
      throw new Error(`AI error: ${(data.error.message || JSON.stringify(data.error)).substring(0, 200)}`);
    }

    const content = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
    if (!content) throw new Error('AI returned empty content');

    console.log(`📥 AI response: ${content.length} chars`);

    // FIX 6: Check for finish_reason = 'length' — means model was cut off.
    // If truncated, try to salvage whatever valid JSON we have.
    const finishReason = data?.choices?.[0]?.finish_reason;
    if (finishReason === 'length') {
      console.warn(`⚠️ Model hit max_tokens — response may be truncated. Attempting salvage...`);
    }

    const jsonText = extractJsonArray(content);

    let parsed: any[];
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      // FIX 7: If JSON is truncated, try to recover partial array by trimming after last complete item
      const lastComma = jsonText.lastIndexOf('},');
      if (lastComma > 0) {
        const salvaged = jsonText.substring(0, lastComma + 1) + ']';
        try {
          parsed = JSON.parse(salvaged);
          console.warn(`⚠️ Salvaged ${parsed.length} items from truncated JSON`);
        } catch {
          throw new Error('AI response JSON is too malformed to recover');
        }
      } else {
        throw new Error('AI response was not valid JSON');
      }
    }

    if (!Array.isArray(parsed)) throw new Error('AI response was not a JSON array');

    const medicines: ParsedMedicine[] = [];
    for (const raw of parsed) {
      const normalized = normalizeMedicine(raw);
      if (normalized) medicines.push(normalized);
    }

    console.log(`✅ ${medicines.length} medicines from chunk`);
    return medicines;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parseChunkWithAI(
  chunk: string,
  apiKey: string,
  model: string,
  attempt: number = 1
): Promise<ParsedMedicine[]> {
  try {
    return await parseChunkWithAILogic(chunk, apiKey, model);
  } catch (error) {
    const isRateLimit = error instanceof Error && error.message === 'RATE_LIMIT';
    const isProviderError = error instanceof Error && error.message.includes('Provider');

    if (attempt >= 5) {
      throw new Error(`Failed after 5 attempts. Last error: ${error instanceof Error ? error.message : String(error)}`);
    }

    let nextModel = model;
    if (isRateLimit || isProviderError) {
      const currentIdx = MODELS.indexOf(model);
      nextModel = currentIdx !== -1 && currentIdx < MODELS.length - 1
        ? MODELS[currentIdx + 1]
        : MODELS[0];
      console.log(`  🔄 Rotating model: ${model} → ${nextModel}`);
    }

    const waitTime = isRateLimit ? 8000 * attempt : 3000;
    console.warn(`  ⚠️ Attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}. Waiting ${waitTime / 1000}s and retrying with ${nextModel}...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    return await parseChunkWithAI(chunk, apiKey, nextModel, attempt + 1);
  }
}

async function parseWithGemini(pdfBuffer: Buffer): Promise<ParseResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('NO_API_KEY');

  const base64Pdf = pdfBuffer.toString('base64');
  console.log('💎 Calling Gemini API...');

  const payload = {
    contents: [{
      parts: [
        { inlineData: { mimeType: "application/pdf", data: base64Pdf } },
        { text: SYSTEM_PROMPT + "\n\nExtract medicines from this PDF. Return ONLY valid JSON array." }
      ]
    }],
    generationConfig: { temperature: 0 }
  };

  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (resp.status === 429) {
    const err: any = new Error('RATE_LIMIT');
    err.status = 429;
    throw err;
  }
  if (!resp.ok) throw new Error(`Gemini status ${resp.status}`);

  const data = await resp.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Empty response from Gemini');

  const jsonText = extractJsonArray(content);
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) throw new Error('Invalid JSON array from Gemini');

  const medicines: ParsedMedicine[] = [];
  for (const raw of parsed) {
    const normalized = normalizeMedicine(raw);
    if (normalized) medicines.push(normalized);
  }

  const uniqueMap = new Map<string, ParsedMedicine>();
  for (const med of medicines) {
    const key = `${med.name.toLowerCase()}|${med.packing.toLowerCase()}`;
    if (!uniqueMap.has(key)) uniqueMap.set(key, med);
  }

  return { medicines: Array.from(uniqueMap.values()), pdfType: 'searchable', provider: 'gemini' };
}

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

  console.log('⚡ Calling Groq API...');
  const chunks = splitTextIntoChunks(text, 8000);
  const allMedicines: ParsedMedicine[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`  Groq Chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Extract medicines from this text. Return ONLY JSON array:\n\n${chunk}` }
        ],
        temperature: 0
      })
    });

    if (resp.status === 429) { const err: any = new Error('RATE_LIMIT'); err.status = 429; throw err; }
    if (!resp.ok) throw new Error(`Groq status ${resp.status}`);

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from Groq');

    const jsonText = extractJsonArray(content);
    let parsed: any[];
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      const lastComma = jsonText.lastIndexOf('},');
      if (lastComma > 0) {
        const salvaged = jsonText.substring(0, lastComma + 1) + ']';
        try {
          parsed = JSON.parse(salvaged);
          console.warn(`⚠️ Salvaged ${parsed.length} items from truncated JSON`);
        } catch {
          throw new Error('AI response JSON is too malformed to recover');
        }
      } else {
        throw new Error('AI response was not valid JSON');
      }
    }

    if (!Array.isArray(parsed)) throw new Error('Invalid JSON array from Groq');

    for (const raw of parsed) {
      const normalized = normalizeMedicine(raw);
      if (normalized) allMedicines.push(normalized);
    }
    
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  const uniqueMap = new Map<string, ParsedMedicine>();
  for (const med of allMedicines) {
    const key = `${med.name.toLowerCase()}|${med.packing.toLowerCase()}`;
    if (!uniqueMap.has(key)) uniqueMap.set(key, med);
  }

  return { medicines: Array.from(uniqueMap.values()), pdfType: 'searchable', provider: 'groq' };
}

export async function parseMedicinesWithAI(rawOcrText: string): Promise<ParseResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return { medicines: [], pdfType: 'unknown', errorCode: 'NO_API_KEY', errorMessage: 'AI API key is not configured. Contact your administrator.' };
  }

  try {
    console.log(`\n========== PARSING MEDICINES ==========`);
    console.log(`📥 Input text length: ${rawOcrText.length} characters`);

    const cleanedText = cleanOcrText(rawOcrText);
    console.log(`✅ After cleaning: ${cleanedText.length} characters`);

    if (cleanedText.length === 0) {
      return { medicines: [], pdfType: 'unknown', errorCode: 'EMPTY_AFTER_CLEAN', errorMessage: 'The extracted text did not contain any recognizable medicine data after cleaning.' };
    }

    // FIX 8: Use the new smaller CHUNK_SIZE_CHARS (3500)
    const chunks = splitTextIntoChunks(cleanedText, CHUNK_SIZE_CHARS);
    console.log(`✅ Created ${chunks.length} chunks`);
    chunks.forEach((chunk, i) => console.log(`  Chunk ${i + 1}: ${chunk.length} chars`));

    const workingModel = await findWorkingModel(apiKey);
    console.log(`✅ Using model: ${workingModel}`);

    const allMedicines: ParsedMedicine[] = [];
    let successCount = 0;
    let failureCount = 0;

    // FIX 9: Removed the 15s slow-mode loop entirely — we are self-hosted.
    // Using 2s delay (REQUEST_INTERVAL_MS) between chunks which is sufficient.
    console.log(`\n🤖 Parsing ${chunks.length} chunks sequentially (2s delay)...`);
    const limiter = new RateLimiter(MAX_CONCURRENT_REQUESTS, REQUEST_INTERVAL_MS);

    const results = await Promise.allSettled(
      chunks.map((chunk) =>
        limiter.execute(() => parseChunkWithAI(chunk, apiKey, workingModel))
      )
    );

    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        allMedicines.push(...(result.value || []));
        successCount++;
      } else {
        console.warn(`  Chunk ${i + 1}: ❌ ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
        failureCount++;
      }
    });

    console.log(`\n📊 Results: ${successCount} successful, ${failureCount} failed`);
    console.log(`💊 Total before dedup: ${allMedicines.length} medicines`);

    if (successCount === 0 && allMedicines.length === 0) {
      return {
        medicines: [], pdfType: 'unknown', errorCode: 'AI_FAILED',
        errorMessage: `AI parsing failed for all ${failureCount} text chunks. Please try again in 1 minute.`
      };
    }

    const uniqueMap = new Map<string, ParsedMedicine>();
    for (const med of allMedicines) {
      const key = `${med.name.toLowerCase()}|${med.packing.toLowerCase()}`;
      if (!uniqueMap.has(key)) uniqueMap.set(key, med);
    }

    console.log(`✅ After dedup: ${uniqueMap.size} unique medicines`);
    console.log(`\n========== PARSING COMPLETE ==========\n`);

    await incrementUsage('openrouter');
    return { medicines: Array.from(uniqueMap.values()), pdfType: 'searchable', provider: 'openrouter' };
  } catch (error) {
    console.error('❌ Error in parseMedicinesWithAI:', error instanceof Error ? error.message : String(error));
    return { medicines: [], pdfType: 'unknown', errorCode: 'PARSE_ERROR', errorMessage: error instanceof Error ? error.message : 'An unexpected error occurred during parsing.' };
  }
}

export async function parsePDFWithAI(pdfBuffer: Buffer): Promise<ParseResult> {
  console.log('📖 Starting 3-Tier PDF parsing sequence...');
  const usage = await getDailyUsage();

  // TIER 1 - Gemini
  try {
    if (process.env.GEMINI_API_KEY && usage.gemini < 1400) {
      const result = await parseWithGemini(pdfBuffer);
      if (result.medicines.length > 0) {
        await incrementUsage('gemini');
        return result;
      }
    } else if (usage.gemini >= 1400) {
      console.log('Gemini daily limit reached (1400). Skipping Tier 1.');
    }
  } catch (error: any) {
    if (error?.status === 429) console.log('Gemini rate limit reached, trying Groq...');
    else console.error('Gemini error:', error?.message || error);
  }

  // TIER 2 - Groq
  try {
    if (process.env.GROQ_API_KEY && usage.groq < 14000) {
      const result = await parseWithGroq(pdfBuffer);
      if (result.medicines.length > 0) {
        await incrementUsage('groq');
        return result;
      }
    } else if (usage.groq >= 14000) {
      console.log('Groq daily limit reached (14000). Skipping Tier 2.');
    }
  } catch (error: any) {
    if (error?.status === 429) console.log('Groq rate limit reached, trying OpenRouter...');
    else if (error?.message === 'NO_TEXT') {
      return { medicines: [], pdfType: 'scanned', errorCode: 'NO_TEXT', errorMessage: 'This PDF appears to be scanned/image-based. Use the "Run OCR" button.' };
    } else console.error('Groq error:', error?.message || error);
  }

  // TIER 3 - OpenRouter
  console.log('🔄 OpenRouter fallback engaged.');
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return { medicines: [], pdfType: 'unknown', errorCode: 'NO_API_KEY', errorMessage: 'AI API key is not configured.' };
  }

  try {
    const PDFParser = require('pdf2json');
    const fullText = await new Promise<string>((resolve) => {
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

    if (!fullText.trim()) {
      return {
        medicines: [], pdfType: 'scanned', errorCode: 'NO_TEXT',
        errorMessage: 'This PDF appears to be scanned/image-based. Use the "Run OCR" button.',
      };
    }

    const result = await parseMedicinesWithAI(fullText);
    result.pdfType = 'searchable';
    return result;
  } catch (error) {
    return {
      medicines: [], pdfType: 'unknown', errorCode: 'PARSE_ERROR',
      errorMessage: error instanceof Error ? error.message : 'Failed to process PDF file.',
    };
  }
}

async function parseTextWithGemini(text: string): Promise<ParseResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('NO_API_KEY');

  console.log('💎 Calling Gemini API (Text Mode)...');
  const payload = {
    contents: [{
      parts: [{ text: SYSTEM_PROMPT + `\n\nExtract medicines from this text. Return ONLY a JSON array:\n\n${text.substring(0, 30000)}` }]
    }],
    generationConfig: { temperature: 0 }
  };

  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (resp.status === 429) { const err: any = new Error('RATE_LIMIT'); err.status = 429; throw err; }
  if (!resp.ok) throw new Error(`Gemini status ${resp.status}`);

  const data = await resp.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Empty response from Gemini');

  const jsonText = extractJsonArray(content);
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) throw new Error('Invalid JSON array from Gemini');

  const medicines: ParsedMedicine[] = [];
  for (const raw of parsed) {
    const normalized = normalizeMedicine(raw);
    if (normalized) medicines.push(normalized);
  }

  const uniqueMap = new Map<string, ParsedMedicine>();
  for (const med of medicines) {
    const key = `${med.name.toLowerCase()}|${med.packing.toLowerCase()}`;
    if (!uniqueMap.has(key)) uniqueMap.set(key, med);
  }

  return { medicines: Array.from(uniqueMap.values()), pdfType: 'scanned', provider: 'gemini' };
}

async function parseTextWithGroq(text: string): Promise<ParseResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('NO_API_KEY');
  if (!text || text.trim().length < 50) throw new Error('NO_TEXT');

  console.log('⚡ Calling Groq API (Text Mode)...');
  const chunks = splitTextIntoChunks(text, 8000);
  const allMedicines: ParsedMedicine[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`  Groq Chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Extract medicines from this text. Return ONLY JSON array:\n\n${chunk}` }
        ],
        temperature: 0
      })
    });

    if (resp.status === 429) { const err: any = new Error('RATE_LIMIT'); err.status = 429; throw err; }
    if (!resp.ok) throw new Error(`Groq status ${resp.status}`);

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from Groq');

    const jsonText = extractJsonArray(content);
    let parsed: any[];
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      const lastComma = jsonText.lastIndexOf('},');
      if (lastComma > 0) {
        const salvaged = jsonText.substring(0, lastComma + 1) + ']';
        try {
          parsed = JSON.parse(salvaged);
          console.warn(`⚠️ Salvaged ${parsed.length} items from truncated JSON`);
        } catch {
          throw new Error('AI response JSON is too malformed to recover');
        }
      } else {
        throw new Error('AI response was not valid JSON');
      }
    }

    if (!Array.isArray(parsed)) throw new Error('Invalid JSON array from Groq');

    for (const raw of parsed) {
      const normalized = normalizeMedicine(raw);
      if (normalized) allMedicines.push(normalized);
    }
    
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  const uniqueMap = new Map<string, ParsedMedicine>();
  for (const med of allMedicines) {
    const key = `${med.name.toLowerCase()}|${med.packing.toLowerCase()}`;
    if (!uniqueMap.has(key)) uniqueMap.set(key, med);
  }

  return { medicines: Array.from(uniqueMap.values()), pdfType: 'scanned', provider: 'groq' };
}

export async function parseTextWithAI(extractedText: string): Promise<ParseResult> {
  console.log('📖 Starting 3-Tier TEXT parsing sequence...');
  if (!extractedText.trim()) {
    return { medicines: [], pdfType: 'scanned', errorCode: 'NO_TEXT', errorMessage: 'The provided text is empty.' };
  }

  const usage = await getDailyUsage();

  // TIER 1 - Gemini
  try {
    if (process.env.GEMINI_API_KEY && usage.gemini < 1400) {
      const result = await parseTextWithGemini(extractedText);
      if (result.medicines.length > 0) { await incrementUsage('gemini'); return result; }
    } else if (usage.gemini >= 1400) {
      console.log('Gemini daily limit reached. Skipping Tier 1.');
    }
  } catch (error: any) {
    if (error?.status === 429) console.log('Gemini rate limit reached, trying Groq...');
    else console.error('Gemini error:', error?.message || error);
  }

  // TIER 2 - Groq
  try {
    if (process.env.GROQ_API_KEY && usage.groq < 14000) {
      const result = await parseTextWithGroq(extractedText);
      if (result.medicines.length > 0) { await incrementUsage('groq'); return result; }
    } else if (usage.groq >= 14000) {
      console.log('Groq daily limit reached. Skipping Tier 2.');
    }
  } catch (error: any) {
    if (error?.status === 429) console.log('Groq rate limit reached, trying OpenRouter...');
    else console.error('Groq error:', error?.message || error);
  }

  // TIER 3 - OpenRouter
  console.log('🔄 OpenRouter fallback engaged for TEXT.');
  const result = await parseMedicinesWithAI(extractedText);
  result.pdfType = 'scanned';
  return result;
}