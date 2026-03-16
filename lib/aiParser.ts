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
  errorCode?: ParseErrorCode;
  errorMessage?: string;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'meta-llama/llama-3.3-70b-instruct:free'
const MAX_CONCURRENT_REQUESTS = 2 // Rate limiting: max 2 concurrent API calls
const REQUEST_INTERVAL_MS = 500 // Minimum delay between requests (ms)
const MAX_PDF_PAGES = 100 // Max pages to process (prevent timeouts)
const MAX_PDF_TEXT_LENGTH = 500000 // Stop processing if text exceeds this (chars)
const REQUEST_TIMEOUT_MS = 45000 // Timeout per request (45s, leaving buffer for Vercel 60s limit)

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
6. Return ONLY valid JSON array, no markdown or extra text
7. Each item MUST have: name (string), packing (string), mrp (number), tradePrice (number)
8. Ignore headers, footers, page numbers, totals, and non-medicine text
9. If text is noisy or unclear, extract whatever medicines you can confidently identify`

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
    if (!trimmed || trimmed.length < 2) continue

    // Skip only very obvious non-medicine lines
    if (/^[\u0900-\u097F\s]+$/.test(trimmed)) continue // Lines that are ONLY Hindi text
    if (trimmed.includes('===') || trimmed.includes('---')) continue
    if (/^(page|total|grand total|sub total|subtotal)\s*[:\d]*$/i.test(trimmed)) continue
    if (/^\d+$/.test(trimmed) && trimmed.length <= 3) continue // Pure page numbers

    // Keep everything else — let the AI figure out what's a medicine
    cleanedLines.push(trimmed)
  }

  return cleanedLines.join('\n')
}

function splitTextIntoChunks(text: string, maxChars: number): string[] {
  const lines = text.split('\n')
  const chunks: string[] = []
  let currentChunk = ''
  const OVERLAP_LINES = 3 // Add overlap to prevent cutting mid-medicine

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const potentialLength = currentChunk.length + line.length + (currentChunk ? 1 : 0)
    
    if (potentialLength > maxChars && currentChunk) {
      chunks.push(currentChunk)
      
      // Start new chunk with overlap — carry last N lines to prevent data loss
      const currentLines = currentChunk.split('\n')
      const overlapLines = currentLines.slice(-OVERLAP_LINES)
      currentChunk = overlapLines.join('\n')
    }
    
    currentChunk += (currentChunk ? '\n' : '') + line
  }

  if (currentChunk) {
    chunks.push(currentChunk)
  }

  return chunks

}

async function parseChunkWithAI(chunk: string, apiKey: string): Promise<ParsedMedicine[]> {
  const MAX_RETRIES = 2;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      
      try {
        console.log(`📤 Sending chunk to AI (${chunk.length} chars, attempt ${attempt}/${MAX_RETRIES})`);
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

        const responseText = await resp.text().catch(() => '');
        console.log(`📋 AI response status: ${resp.status}`);
        
        let data: any = null;
        try {
          data = JSON.parse(responseText);
        } catch {
          console.warn('⚠️ AI response is not valid JSON:', responseText.substring(0, 300));
          if (attempt < MAX_RETRIES) {
            console.log('🔄 Retrying...');
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          throw new Error('AI returned invalid JSON response');
        }

        // Check for API errors
        if (data?.error) {
          console.warn('⚠️ AI API error:', JSON.stringify(data.error).substring(0, 300));
          if (attempt < MAX_RETRIES) {
            console.log('🔄 Retrying after API error...');
            await new Promise(r => setTimeout(r, 3000));
            continue;
          }
          throw new Error(`AI API error: ${data.error.message || JSON.stringify(data.error)}`);
        }

        const content =
          data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';

        if (!content || typeof content !== 'string') {
          console.warn('⚠️ No content from AI');
          console.warn('📋 Full AI response:', responseText.substring(0, 500));
          if (attempt < MAX_RETRIES) {
            console.log('🔄 Retrying...');
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          throw new Error('AI returned empty content after retries');
        }

        console.log(`📥 AI response received (${content.length} chars)`);
        const jsonText = extractJsonArray(content);

        const parsed = JSON.parse(jsonText);
        if (!Array.isArray(parsed)) {
          console.warn('⚠️ AI response is not array:', typeof parsed);
          throw new Error('AI response was not a JSON array');
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
        console.warn(`❌ AI parsing error (attempt ${attempt}):`, error instanceof Error ? error.message : String(error));
      }
      if (attempt >= MAX_RETRIES) {
        throw error; // Propagate to caller so it counts as a failure
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error('All AI retry attempts failed');
}

export async function parseMedicinesWithAI(rawOcrText: string): Promise<ParseResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.error('❌ OPENROUTER_API_KEY not found');
    return { medicines: [], pdfType: 'unknown', errorCode: 'NO_API_KEY', errorMessage: 'AI API key is not configured. Contact your administrator.' };
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
      return { medicines: [], pdfType: 'unknown', errorCode: 'EMPTY_AFTER_CLEAN', errorMessage: 'The extracted text did not contain any recognizable medicine data after cleaning.' };
    }
    
    console.log(`📝 Cleaned text sample:\n${cleanedText.substring(0, 200)}`);
    
    console.log(`\n📦 Splitting into chunks...`);
    const chunks = splitTextIntoChunks(cleanedText, 3000);
    console.log(`✅ Created ${chunks.length} chunks`);
    
    if (chunks.length === 0) {
      console.warn('❌ No chunks created');
      return { medicines: [], pdfType: 'unknown', errorCode: 'EMPTY_AFTER_CLEAN', errorMessage: 'No text chunks could be created from the PDF.' };
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

    if (allMedicines.length === 0) {
      const errorMsg = failureCount > 0
        ? `AI parsing failed for all ${failureCount} text chunks. The AI model may be temporarily unavailable — please try again in a moment.`
        : 'No medicines could be extracted. The text may not contain recognizable medicine data.';
      return { medicines: [], pdfType: 'unknown', errorCode: 'AI_FAILED', errorMessage: errorMsg };
    }

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
    
    return { medicines: Array.from(uniqueMap.values()), pdfType: 'searchable' };
  } catch (error) {
    console.error('❌ Error in parseMedicinesWithAI:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('Stack:', error.stack.substring(0, 300));
    }
    return { medicines: [], pdfType: 'unknown', errorCode: 'PARSE_ERROR', errorMessage: error instanceof Error ? error.message : 'An unexpected error occurred during parsing.' };
  }
}

/**
 * Parse a PDF buffer server-side using pdf2json for text extraction.
 * Returns structured result with error codes for UI messaging.
 */
export async function parsePDFWithAI(pdfBuffer: Buffer): Promise<ParseResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.error('❌ OPENROUTER_API_KEY not set');
    return { medicines: [], pdfType: 'unknown', errorCode: 'NO_API_KEY', errorMessage: 'AI API key is not configured.' };
  }

  try {
    console.log('📖 Starting PDF parsing...');
    console.log(`📊 Buffer size: ${pdfBuffer.length} bytes`);
    
    // Extract text from PDF using pdf2json
    console.log('🔧 Extracting text with pdf2json...');
    const PDFParser = require('pdf2json');
    
    const fullText = await new Promise<string>((resolve) => {
      let extractedText = '';
      const parser = new PDFParser();
      let completed = false;
      
      const timeout = setTimeout(() => {
        if (!completed) {
          console.warn('⏱️ Extraction timeout');
          completed = true;
          resolve('');
        }
      }, 5000);
      
      parser.on('pdfParser_dataError', () => {
        if (!completed) {
          completed = true;
          clearTimeout(timeout);
          resolve('');
        }
      });
      
      parser.on('pdfParser_dataReady', (pdfData: any) => {
        if (completed) return;
        
        try {
          console.log(`✅ PDF loaded - ${pdfData.pages?.length || 0} pages`);
          
          if (pdfData.pages && Array.isArray(pdfData.pages)) {
            for (let pageNum = 0; pageNum < Math.min(pdfData.pages.length, 100); pageNum++) {
              const page = pdfData.pages[pageNum];
              if (page.texts && Array.isArray(page.texts)) {
                const pageText = page.texts
                  .map((item: any) => {
                    try {
                      if (item.R && item.R[0]?.T) return decodeURIComponent(item.R[0].T);
                    } catch (e) {}
                    return '';
                  })
                  .filter((t: string) => t)
                  .join(' ');
                
                if (pageText.trim()) {
                  extractedText += pageText + '\n';
                  console.log(`  ✓ Page ${pageNum + 1}: ${pageText.length} chars`);
                }
              }
            }
          }
          
          completed = true;
          clearTimeout(timeout);
          resolve(extractedText);
        } catch (error) {
          completed = true;
          clearTimeout(timeout);
          resolve('');
        }
      });
      
      try {
        parser.parseBuffer(pdfBuffer);
      } catch (error) {
        completed = true;
        clearTimeout(timeout);
        resolve('');
      }
    });
    
    console.log(`📊 Extracted text: ${fullText.length} characters`);
    
    if (!fullText.trim()) {
      console.log('⚠️ No searchable text found in PDF');
      console.log('💡 This PDF appears to be image-based (scanned)');
      return {
        medicines: [],
        pdfType: 'scanned',
        errorCode: 'NO_TEXT',
        errorMessage: 'This PDF appears to be scanned/image-based. No searchable text was found. Use the "Run OCR" button to extract text from images.',
      };
    }
    
    console.log(`✅ Passing text to AI parser...`);
    const result = await parseMedicinesWithAI(fullText);
    
    // Preserve pdfType as searchable since pdf2json found text
    result.pdfType = 'searchable';
    console.log(`🎉 Successfully parsed ${result.medicines.length} medicines!`);
    
    return result;
  } catch (error) {
    console.error('❌ PDF parsing failed:', error instanceof Error ? error.message : String(error));
    return {
      medicines: [],
      pdfType: 'unknown',
      errorCode: 'PARSE_ERROR',
      errorMessage: error instanceof Error ? error.message : 'Failed to process PDF file.',
    };
  }
}

/**
 * Parse pre-extracted text (e.g. from client-side OCR) with AI.
 * Skips pdf2json extraction since text is already available.
 */
export async function parseTextWithAI(extractedText: string): Promise<ParseResult> {
  if (!extractedText.trim()) {
    return {
      medicines: [],
      pdfType: 'scanned',
      errorCode: 'NO_TEXT',
      errorMessage: 'The provided text is empty.',
    };
  }

  const result = await parseMedicinesWithAI(extractedText);
  result.pdfType = 'scanned'; // Text came from client-side OCR
  return result;
}


