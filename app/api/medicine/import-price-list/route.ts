export type ParsedMedicine = {
  name: string
  packing: string
  mrp: number
  tradePrice: number
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'meta-llama/llama-3.3-70b-instruct:free'

const SYSTEM_PROMPT = `You are a pharmacy data parser for Ayurvedic distributor price lists.

Your ONLY job is to extract medicine records from the cleaned OCR text provided.
The text has already been pre-filtered. Lines with commas and Hindi have been removed.

RULES:
1. Medicine name is ALWAYS in FULL ENGLISH CAPITALS e.g. BRAHMI VATI, GANDHAK RASAYAN
2. Brackets are allowed in names e.g. BRAHMI VATI (S.M.Y.), MALLASINDUR (KUPIPAKWA)
3. Medicine name NEVER contains a comma
4. Packing looks like: 30 Cap, 80 Tab, 450 Ml, 100 Gm, 50 ml, 10 Tab, 1 Kg, 500 Mg
5. MRP and Trade Price are numbers near the packing
6. Same medicine with different packing = separate records
7. Return ONLY a valid JSON array. No markdown. No backticks. No explanation.
8. Each item must have exactly: name (string), packing (string), mrp (number), tradePrice (number)
9. If unsure about any line — SKIP IT`

// Words that should never appear in a valid medicine name
const NAME_BAD_WORDS = new Set([
  'disorders', 'diseases', 'syndrome', 'infection', 'weakness',
  'fever', 'cough', 'acidity', 'pain', 'calculus', 'retention',
  'epilepsy', 'convulsions', 'diarrhoea', 'constipation', 'tuberculosis',
  'anaemia', 'leucorrhoea', 'metrorrhagia', 'inflammation', 'toothache',
  'bodyache', 'bleeding', 'burning', 'swelling', 'jaundice', 'insomnia',
  'paralysis', 'arthritis', 'obesity', 'diabetes', 'useful', 'indigestion',
  'dyspepsia', 'colic', 'sprue', 'urinary', 'pulmonary', 'cardiac',
  'stomach', 'liver', 'kidney', 'blood', 'nerve', 'joint', 'skin',
  'general', 'chronic', 'acute', 'all', 'kinds', 'types', 'various',
  'abdominal', 'digestive', 'respiratory', 'gynaec', 'obstetric',
  'deodinal', 'vaccal', 'tumour', 'tumor', 'cancer', 'malaria',
  'haemorrhage', 'haematinic', 'rasayan', 'penile', 'debility',
])

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

function isValidMedicineName(name: string): boolean {
  if (!name || name.length < 3) return false

  // Must not contain a comma
  if (name.includes(',')) return false

  // Must not start with lowercase
  if (/^[a-z]/.test(name)) return false

  // Check for bad words (case insensitive)
  const words = name.toLowerCase().split(/\s+/)
  for (const word of words) {
    const clean = word.replace(/[^a-z]/g, '')
    if (NAME_BAD_WORDS.has(clean)) return false
  }

  // Must contain at least one all-caps word (real medicine names always do)
  const hasCapWord = name.split(/\s+/).some(w => w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w))
  if (!hasCapWord) return false

  return true
}

function normalizeMedicine(item: any): ParsedMedicine | null {
  if (!item || typeof item !== 'object') return null

  const name = typeof item.name === 'string' ? item.name.trim() : ''
  const packing = typeof item.packing === 'string' ? item.packing.trim() : ''
  const mrp = typeof item.mrp === 'number' ? item.mrp : Number(item.mrp)
  const tradePrice = typeof item.tradePrice === 'number' ? item.tradePrice : Number(item.tradePrice)

  if (!name || !packing || Number.isNaN(mrp) || Number.isNaN(tradePrice)) return null
  if (mrp <= 0 || tradePrice <= 0) return null

  // Final name validation - reject anything that looks like a description
  if (!isValidMedicineName(name)) return null

  return { name, packing, mrp, tradePrice }
}

function cleanOcrText(rawOcrText: string): string {
  const lines = rawOcrText.split('\n')
  const cleanedLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length < 2) continue

    // REMOVE: contains comma → always a description
    if (trimmed.includes(',')) continue

    // REMOVE: contains Hindi unicode
    if (/[\u0900-\u097F]/.test(trimmed)) continue

    // REMOVE: starts with lowercase letter → description line
    if (/^[a-z]/.test(trimmed)) continue

    // REMOVE: contains bad words
    const lowerTrimmed = trimmed.toLowerCase()
    const words = lowerTrimmed.split(/\s+/)
    const hasBadWord = words.some(w => NAME_BAD_WORDS.has(w.replace(/[^a-z]/g, '')))
    if (hasBadWord) continue

    // REMOVE: looks like a sentence (more than 6 words and mixed case)
    if (words.length > 6 && trimmed !== trimmed.toUpperCase()) continue

    // KEEP: product code (starts with digits)
    if (/^\d{3,8}\s*[A-Z#]?/.test(trimmed)) {
      cleanedLines.push(trimmed)
      continue
    }

    // KEEP: all caps line (medicine name)
    if (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) {
      cleanedLines.push(trimmed)
      continue
    }

    // KEEP: contains packing keywords
    if (/\b(?:Tab|Cap|Ml|Gm|Mg|Kg|ml|gm)\b/.test(trimmed)) {
      cleanedLines.push(trimmed)
      continue
    }

    // KEEP: looks like a price number
    if (/^\d+(\.\d{1,2})?$/.test(trimmed)) {
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

  if (currentChunk) chunks.push(currentChunk)
  return chunks
}

async function parseChunkWithAI(chunk: string, apiKey: string): Promise<ParsedMedicine[]> {
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
        max_tokens: 8000,
      }),
    })

    const data = await resp.json().catch(() => null)
    const content = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || ''
    if (!content || typeof content !== 'string') return []

    const jsonText = extractJsonArray(content)
    const parsed = JSON.parse(jsonText)
    if (!Array.isArray(parsed)) return []

    const medicines: ParsedMedicine[] = []
    for (const raw of parsed) {
      const normalized = normalizeMedicine(raw)
      if (normalized) medicines.push(normalized)
    }

    return medicines
  } catch {
    return []
  }
}

export async function parseMedicinesWithAI(rawOcrText: string): Promise<ParsedMedicine[]> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return []

  const cleanedText = cleanOcrText(rawOcrText)
  const chunks = splitTextIntoChunks(cleanedText, 3000)
  if (chunks.length === 0) return []

  const promises = chunks.map(chunk => parseChunkWithAI(chunk, apiKey))
  const results = await Promise.allSettled(promises)

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
