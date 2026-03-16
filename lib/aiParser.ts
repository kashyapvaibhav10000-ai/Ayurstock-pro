export type ParsedMedicine = {
  name: string
  packing: string
  mrp: number
  tradePrice: number
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'meta-llama/llama-3.3-70b-instruct:free'
const MAX_CONCURRENT_REQUESTS = 2 // Rate limiting: max 2 concurrent API calls
const REQUEST_INTERVAL_MS = 500 // Minimum delay between requests (ms)
const MAX_PDF_PAGES = 100 // Max pages to process (prevent timeouts)
const MAX_PDF_TEXT_LENGTH = 500000 // Stop processing if text exceeds this (chars)
const REQUEST_TIMEOUT_MS = 45000 // Timeout per request (45s, leaving buffer for Vercel 60s limit)

const SYSTEM_PROMPT = `You are a pharmacy data parser for Ayurvedic distributor price lists.

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
1. Medicine name is in ALL CAPITALS
2. Extract ALL packing + price combinations for each medicine
3. Return separate record for EACH variant, NOT combined
4. packing format: "200ML", "60TAB", "100GM", "1KG", etc
5. Prices are EXACT numbers from list (mrp and tradePrice)
6. Return ONLY valid JSON array, no markdown or extra text
7. Each item MUST have: name (string), packing (string), mrp (number), tradePrice (number)`

function extractJsonArray(text: string): string {
  let cleaned = text.trim()

  // Strip markdown fences if present
  cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/m, '')

  // Try to find the first and last bracket for a JSON array
  const first = cleaned.indexOf('[')
  const last = cleaned.lastIndexOf(']')

  if (first !== -1 && last !== -1 && last > first) {
    return cleaned.substring(first, last + 1)
  }

  return cleaned
}

// Rate limiter: limits concurrent execution
class RateLimiter {
  private activeRequests = 0;
  private queue: Array<() => void> = [];

  constructor(
    private maxConcurrent: number,
    private delayBetweenMs: number
  ) {}

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

  async executeAll<T>(fns: Array<() => Promise<T>>): Promise<PromiseSettledResult<T>[]> {
    return Promise.allSettled(
      fns.map(fn => this.execute(fn))
    );
  }
}

function normalizeMedicine(item: any): ParsedMedicine | null {
  if (!item || typeof item !== 'object') return null

  const name = typeof item.name === 'string' ? item.name.trim() : ''
  const packing = typeof item.packing === 'string' ? item.packing.trim() : ''
  const mrp = typeof item.mrp === 'number' ? item.mrp : Number(item.mrp)
  const tradePrice = typeof item.tradePrice === 'number' ? item.tradePrice : Number(item.tradePrice)

  if (!name || !packing || Number.isNaN(mrp) || Number.isNaN(tradePrice)) return null

  return {
    name,
    packing,
    mrp,
    tradePrice,
  }
}

const BAD_WORDS = new Set([
  'disorders', 'diseases', 'syndrome', 'infection',
  'weakness', 'fever', 'cough', 'acidity', 'pain',
  'calculus', 'retention', 'epilepsy', 'convulsions',
  'diarrhoea', 'constipation', 'tuberculosis', 'anaemia',
  'leucorrhoea', 'metrorrhagia', 'inflammation', 'toothache',
  'bodyache', 'bleeding', 'burning', 'swelling', 'jaundice',
  'insomnia', 'paralysis', 'arthritis', 'obesity', 'diabetes'
].map(word => word.toLowerCase()))

function cleanOcrText(rawOcrText: string): string {
  const lines = rawOcrText.split('\n')
  const cleanedLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length < 3) continue

    // Skip obvious non-medicine lines
    if (/[\u0900-\u097F]/.test(trimmed)) continue // Hindi text only
    if (trimmed.toLowerCase().includes('total') || trimmed.toLowerCase().includes('page')) continue
    if (trimmed.includes('===') || trimmed.includes('---')) continue
    
    // Keep if contains price-like patterns (numbers with decimals)
    if (/\d+\.\d{2}/.test(trimmed)) {
      cleanedLines.push(trimmed)
      continue
    }
    
    // Keep if all caps and at least 2 chars (likely medicine name)
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 2) {
      cleanedLines.push(trimmed)
      continue
    }
    
    // Keep if contains measurement units
    if (/\b(tab|cap|ml|gm|mg|kg|piece|strip|bottle|vial|jar)\b/i.test(trimmed)) {
      cleanedLines.push(trimmed)
      continue
    }
  }

  return cleanedLines.join('\n')
}

function splitTextIntoChunks(text: string, maxChars: number): string[] {
  const lines = text.split('\n')
  const chunks: string[] = []
  let currentChunk = ''

  for (const line of lines) {
    const potentialLength = currentChunk.length + line.length + (currentChunk ? 1 : 0)
    if (potentialLength > maxChars) {
      if (currentChunk) {
        chunks.push(currentChunk)
        currentChunk = ''
      }
    }
    currentChunk += (currentChunk ? '\n' : '') + line
  }

  if (currentChunk) {
    chunks.push(currentChunk)
  }

  return chunks
}

async function parseChunkWithAI(chunk: string, apiKey: string): Promise<ParsedMedicine[]> {
  try {
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    
    try {
      console.log(`📤 Sending chunk to AI (${chunk.length} chars)`);
      const resp = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: chunk },
          ],
          temperature: 0,
          max_tokens: 9000,
        }),
        signal: controller.signal,
      });

      const data = await resp.json().catch(() => null);

      const content =
        data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';

      if (!content || typeof content !== 'string') {
        console.warn('⚠️ No content from AI');
        return [];
      }

      console.log(`📥 AI response received (${content.length} chars)`);
      const jsonText = extractJsonArray(content);

      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) {
        console.warn('⚠️ AI response is not array:', typeof parsed);
        return [];
      }

      console.log(`✅ Parsed ${parsed.length} items from chunk`);
      const medicines: ParsedMedicine[] = [];
      for (const raw of parsed) {
        const normalized = normalizeMedicine(raw);
        if (normalized) {
          medicines.push(normalized);
        }
      }

      console.log(`💊 After normalization: ${medicines.length} valid medicines`);
      return medicines;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('⏱️ AI request timeout');
    } else {
      console.warn('❌ AI parsing error:', error instanceof Error ? error.message : String(error));
    }
    return [];
  }
}

export async function parseMedicinesWithAI(rawOcrText: string): Promise<ParsedMedicine[]> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.error('❌ OPENROUTER_API_KEY not found');
    return [];
  }

  try {
    console.log(`\n========== PARSING MEDICINES ==========`);
    console.log(`📥 Input text length: ${rawOcrText.length} characters`);
    console.log(`📝 First 200 chars:\n${rawOcrText.substring(0, 200)}`);
    
    console.log(`\n🧹 Cleaning text...`);
    const cleanedText = cleanOcrText(rawOcrText);
    console.log(`✅ After cleaning: ${cleanedText.length} characters`);
    
    if (cleanedText.length === 0) {
      console.warn('❌ Text became empty after cleaning!');
      console.log(`📋 Example kept lines from raw text:`);
      const sampleLines = rawOcrText.split('\n').slice(0, 20);
      sampleLines.forEach((line, i) => console.log(`  ${i}: ${line.substring(0, 100)}`));
      return [];
    }
    
    console.log(`📝 Cleaned text sample:\n${cleanedText.substring(0, 200)}`);
    
    console.log(`\n📦 Splitting into chunks...`);
    const chunks = splitTextIntoChunks(cleanedText, 3000);
    console.log(`✅ Created ${chunks.length} chunks`);
    
    if (chunks.length === 0) {
      console.warn('❌ No chunks created');
      return [];
    }
    
    chunks.forEach((chunk, i) => {
      console.log(`  Chunk ${i + 1}: ${chunk.length} chars`);
    });

    console.log(`\n🤖 Calling AI for each chunk...`);
    // Use rate limiter to prevent hitting API limits
    const limiter = new RateLimiter(MAX_CONCURRENT_REQUESTS, REQUEST_INTERVAL_MS);
    const chunkFunctions = chunks.map(chunk => () => parseChunkWithAI(chunk, apiKey));
    const results = await limiter.executeAll(chunkFunctions);

    console.log(`\n📊 Processing results from ${results.length} chunks...`);
    const allMedicines: ParsedMedicine[] = [];
    let successCount = 0;
    let failureCount = 0;
    
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        const fulfilledResult = results[i] as PromiseFulfilledResult<ParsedMedicine[]>;
        const value = fulfilledResult.value;
        allMedicines.push(...value);
        console.log(`  Chunk ${i + 1}: ✅ ${value.length} medicines`);
        successCount++;
      } else {
        const rejectedResult = results[i] as PromiseRejectedResult;
        console.log(`  Chunk ${i + 1}: ❌ Failed - ${rejectedResult.reason}`);
        failureCount++;
      }
    }

    console.log(`\n📊 Results: ${successCount} successful, ${failureCount} failed`);
    console.log(`💊 Total before dedup: ${allMedicines.length} medicines`);

    // Deduplicate using name + packing as key
    const uniqueMap = new Map<string, ParsedMedicine>();
    for (const med of allMedicines) {
      const key = `${med.name.toLowerCase()}|${med.packing.toLowerCase()}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, med);
      }
    }

    console.log(`✅ After dedup: ${uniqueMap.size} unique medicines`);
    console.log(`\n========== PARSING COMPLETE ==========\n`);
    
    return Array.from(uniqueMap.values());
  } catch (error) {
    console.error('❌ Error in parseMedicinesWithAI:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('Stack:', error.stack.substring(0, 300));
    }
    return [];
  }
}

export async function parsePDFWithAI(pdfBuffer: Buffer): Promise<ParsedMedicine[]> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.error('❌ OPENROUTER_API_KEY not set');
    return [];
  }

  try {
    console.log('📖 Starting PDF parsing with pdf-parse...');
    console.log(`📊 Buffer size: ${pdfBuffer.length} bytes`);
    
    // Import pdf-parse correctly - use the default export from CJS
    let pdfParse;
    try {
      // Try direct require first (for serverless)
      pdfParse = require('pdf-parse');
      console.log('✅ pdf-parse imported via require');
    } catch (importError) {
      console.warn('⚠️ Direct require failed, trying alternative import');
      try {
        // Fallback to ESM import
        const pdfParseModule = await import('pdf-parse');
        pdfParse = pdfParseModule.default;
        console.log('✅ pdf-parse imported via ESM');
      } catch (esmError) {
        throw new Error(`Failed to import pdf-parse: ${importError instanceof Error ? importError.message : String(importError)}`);
      }
    }
    
    console.log('🔧 Calling pdfParse with buffer...');
    const pdfData = await pdfParse(pdfBuffer);
    console.log(`✅ PDF parsed successfully`);
    console.log(`📄 Total pages: ${pdfData.numpages}`);
    console.log(`📝 Extracted text length: ${pdfData.text.length} chars`);
    
    if (pdfData.text.length > 0) {
      console.log(`📋 First 300 chars:\n${pdfData.text.substring(0, 300)}`);
    } else {
      console.warn('⚠️ PDF text is empty!');
    }
    
    const fullText = pdfData.text;
    
    if (!fullText.trim()) {
      console.warn('❌ No text extracted from PDF - returning empty array');
      return [];
    }
    
    console.log(`✅ PDF extraction complete, passing ${fullText.length} chars to AI parser...`);
    
    const result = await parseMedicinesWithAI(fullText);
    console.log(`🎉 Final result: ${result.length} medicines extracted`);
    
    return result;
  } catch (error) {
    console.error('❌ PDF parsing failed:', error);
    console.error('❌ Error type:', typeof error);
    console.error('❌ Error toString:', String(error));
    if (error instanceof Error) {
      console.error('📋 Error message:', error.message);
      console.error('📋 Error name:', error.name);
      console.error('🔗 Stack trace:', error.stack?.substring(0, 500));
    }
    return []
  }
}


