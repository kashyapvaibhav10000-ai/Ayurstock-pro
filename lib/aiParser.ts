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

STRICT RULES for identifying a valid medicine name:
1. Medicine name is ALWAYS written in FULL ENGLISH CAPITALS
   example: GANDHAK RASAYAN, BRAHMI VATI (S.M.Y.), MALLASINDUR (KUPIPAKWA)
2. Medicine name NEVER contains a comma - if a line has a comma SKIP IT
3. Brackets are ALLOWED in medicine names 
   example: AROGYAVADHINI GUTIKA (RASA), SAMIRPANNAG RASA (KUPIPAKWA)
4. Medicine name NEVER starts with a lowercase letter
5. Medicine name NEVER contains disease words like:
   Fever, Cough, Acidity, Weakness, Piles, Diabetes, Anaemia,
   Tuberculosis, Arthritis, Bodyache, Burn, Penile, Leucorrhoea,
   Metrorrhagia, Indigestion, Duodinal, Toothache, Pulmonary,
   Urinary, Inflammation, Disorders, Constipation, Jaundice
6. If a line contains a comma - it is a description - SKIP IT
7. If a line is in Hindi script - SKIP IT
8. If a line is a category header like PATENT MEDICINES,
   CAPSULES, TABLETS, GUGGULU, CHURNA, BHASMA - SKIP IT
9. Packing examples: 30 Cap, 80 Tab, 450 Ml, 100 Gm,
   50 ml, 10 Tab, 1 Kg, 500 Mg, 3x10 Cap, 60 Tab
10. Each medicine may appear multiple times with different
    packing and price - treat each as separate record
11. Return ONLY a valid JSON array. No markdown. No backticks.
    Each item: name (string), packing (string),
    mrp (number), tradePrice (number)
12. When unsure if a line is a medicine name or description - SKIP IT`

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
    if (!trimmed) continue

    // Remove conditions
    if (trimmed.includes(',')) continue // 1. Contains comma
    if (/[\u0900-\u097F]/.test(trimmed)) continue // 2. Contains Hindi unicode
    const words = trimmed.split(/\s+/)
    if (words.length > 5 && trimmed !== trimmed.toUpperCase()) continue // 3. More than 5 words and not all caps
    if (/^[a-z]/.test(trimmed)) continue // 4. Starts with lowercase
    const lowerTrimmed = trimmed.toLowerCase()
    if (BAD_WORDS.has(lowerTrimmed) || words.some(word => BAD_WORDS.has(word.toLowerCase()))) continue // 5. Contains bad words

    // Keep conditions
    let keep = false
    if (/^\d{3,8}\s?[A-Z#?]?/.test(trimmed)) keep = true // Product code
    else if (trimmed === trimmed.toUpperCase() && trimmed.length > 0) keep = true // All caps
    else if (/\b(?:Tab|Cap|Ml|Gm|Mg|Kg)\b/i.test(trimmed)) keep = true // Packing
    else if (/^\d+(\.\d{1,2})?$/.test(trimmed) && !isNaN(Number(trimmed))) keep = true // Price

    if (keep) {
      cleanedLines.push(trimmed)
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

      if (!content || typeof content !== 'string') return [];

      const jsonText = extractJsonArray(content);

      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) return [];

      const medicines: ParsedMedicine[] = [];
      for (const raw of parsed) {
        const normalized = normalizeMedicine(raw);
        if (normalized) medicines.push(normalized);
      }

      return medicines;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('API request timeout');
    }
    return [];
  }
}

export async function parseMedicinesWithAI(rawOcrText: string): Promise<ParsedMedicine[]> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return []

  const cleanedText = cleanOcrText(rawOcrText)
  const chunks = splitTextIntoChunks(cleanedText, 3000)
  if (chunks.length === 0) return []

  // Use rate limiter to prevent hitting API limits
  const limiter = new RateLimiter(MAX_CONCURRENT_REQUESTS, REQUEST_INTERVAL_MS)
  const chunkFunctions = chunks.map(chunk => () => parseChunkWithAI(chunk, apiKey))
  const results = await limiter.executeAll(chunkFunctions)

  const allMedicines: ParsedMedicine[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allMedicines.push(...result.value)
    }
  }

  // Deduplicate using name + packing as key
  const uniqueMap = new Map<string, ParsedMedicine>()
  for (const med of allMedicines) {
    const key = `${med.name.toLowerCase()}|${med.packing.toLowerCase()}`
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, med)
    }
  }

  return Array.from(uniqueMap.values())
}

export async function parsePDFWithAI(pdfBuffer: Buffer): Promise<ParsedMedicine[]> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return []

  try {
    // Dynamically import pdfjs for serverless compatibility
    const pdfjsLib = await import('pdfjs-dist');
    const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
    const pdf = await loadingTask.promise;
    
    // Limit pages processed to prevent timeout on large PDFs
    const totalPages = Math.min(pdf.numPages, MAX_PDF_PAGES);
    let fullText = '';
    
    console.log(`Processing PDF: ${totalPages}/${pdf.numPages} pages`);
    
    for (let i = 1; i <= totalPages; i++) {
      // Stop early if we have enough text
      if (fullText.length >= MAX_PDF_TEXT_LENGTH) {
        console.log(`Text length limit reached at page ${i}`);
        break;
      }
      
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n';
      } catch (pageError) {
        console.warn(`Failed to extract page ${i}:`, pageError);
        // Continue with next page instead of failing
        continue;
      }
    }
    
    if (!fullText.trim()) return [];
    console.log(`PDF extraction complete: ${totalPages} pages, ${fullText.length} chars`);
    return await parseMedicinesWithAI(fullText);
  } catch (error) {
    console.error('PDF parsing failed:', error)
    return []
  }
}


