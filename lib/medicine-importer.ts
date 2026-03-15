import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Tesseract from 'tesseract.js';

export interface ParsedMedicineImportRow {
  name: string;
  company: string;
  category: string;
  hsn: string;
  barcode: string;
  rackLocation: string;
  mrp?: number;
  packing?: string;
  tradePrice?: number;
  sourceType: 'text-pdf' | 'ocr-pdf' | 'image-ocr' | 'ai-vision';
}

const HEADER_PATTERNS = [
  /price list/i,
  /product name/i,
  /retail/i,
  /trade/i,
  /packing/i,
  /code/i,
  /page\s+\d+/i,
  /all kinds of/i,
  /s\.\s*no/i,
  /description/i,
];

const COMPANY_PATTERNS = [
  /ayukalp/i,
  /himalaya/i,
  /dabur/i,
  /baidyanath/i,
  /patanjali/i,
  /zandu/i,
  /charak/i,
  /sandu/i,
];

const PRODUCT_SUFFIX_PATTERN =
  /\b(VATI|GUTIKA|RASA|LOHA|BHASMA|PISHTI|PARPATI|MANDUR|MANDUF|CHURNA|GUGGULU|TAILA|ASAVA|ARISHTA|LEHA|LEHYA|PAKA|GHANVATI|SINDUR|SYRUP|CAPSULE|TABLET)\b/i;

const CONTINUATION_TOKENS = [
  /^COATED\)?$/i,
  /^RASA/i,
  /^SPECIAL/i,
  /^LOHA/i,
  /^PARPATI/i,
  /^PISHTI/i,
];

function normalizeLine(line: string) {
  return line
    .replace(/[\u0900-\u097F]+/g, ' ')
    .replace(/[|]/g, ' ')
    .replace(/[_=~]+/g, ' ')
    .replace(/\bO(?=\d)/g, '0')
    .replace(/(?<=\d)O\b/g, '0')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function inferCompany(text: string, fileName: string) {
  const lines = text
    .split('\n')
    .map((line) => normalizeLine(line))
    .filter(Boolean);
  const companyLine = lines.find((line) => COMPANY_PATTERNS.some((pattern) => pattern.test(line)));

  if (companyLine) {
    return titleCase(
      companyLine
        .replace(/uap pharma pvt\. ltd\.?/gi, '')
        .replace(/price list|product list|distributor|catalog/gi, '')
        .trim()
    );
  }

  return '';
}

function inferCategory(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes('capsule')) return 'Capsule';
  if (normalized.includes('tablet') || normalized.includes('vati') || normalized.includes('gutika')) {
    return 'Tablet';
  }
  if (normalized.includes('syrup') || normalized.includes('asava') || normalized.includes('arishta')) {
    return 'Syrup';
  }
  if (normalized.includes('taila')) return 'Oil';
  if (normalized.includes('churna')) return 'Churna';
  if (normalized.includes('guggulu')) return 'Tablet';
  return '';
}

function isProductCandidate(line: string) {
  if (!line || HEADER_PATTERNS.some((pattern) => pattern.test(line))) {
    return false;
  }

  if (
    /AYUKALP|AHMEDABAD|INDUSTRIES|ESTATE|HIGHWAY|MORAIYA|SANAND|PHARMA|PVT/i.test(line)
  ) {
    return false;
  }

  if (/^\d+(\s+(TAB|GM|KG|ML|LTR|MG))?$/i.test(line)) {
    return false;
  }

  if (/,/.test(line) && !/\(/.test(line)) {
    return false;
  }

  return /^[A-Z][A-Z0-9()\-.,/& ]+[A-Z)]$/i.test(line) && line.length >= 5;
}

function shouldMergeWithPrevious(previous: string, current: string) {
  if (!previous || !current) {
    return false;
  }

  return (
    previous.endsWith('(') ||
    previous.endsWith('/') ||
    CONTINUATION_TOKENS.some((pattern) => pattern.test(current)) ||
    (!PRODUCT_SUFFIX_PATTERN.test(previous) && current.length <= 24)
  );
}

function sanitizeProductName(name: string) {
  return name
    .replace(/\s+/g, ' ')
    .replace(/\s+\(\s+/g, ' (')
    .trim();
}

const PACKING_KEYWORDS = [
  'capsule',
  'capsules',
  'tablet',
  'tablets',
  'tab',
  'tabs',
  'syrup',
  'churna',
  'powder',
  'oil',
  'ointment',
  'cream',
  'gel',
  'drops',
  'lotion',
  'strip',
  'bottle',
  'pack',
  'pouch',
  'tube',
  'box',
  'jar',
  'sachet',
  'gm',
  'gms',
  'kg',
  'mg',
  'ml',
  'ltr',
];

function normalizeProductText(value: string) {
  return value
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BAD_NAME_PHRASES = [
  /loss of appetite/gi,
  /blood purifier/gi,
  /health tonic/gi,
  /chronic/gi,
  /general debility/gi,
  /colic/gi,
  /diarrhoea|diarrhea/gi,
  /sprue/gi,
  /epileptic|epilepsy/gi,
  /insanity/gi,
  /appetite/gi,
  /purifier/gi,
  /debility/gi,
  /tonic/gi,
];

function stripMarketingText(value: string) {
  let cleaned = value;
  for (const pattern of BAD_NAME_PHRASES) {
    cleaned = cleaned.replace(pattern, ' ');
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (cleaned.includes('-') || cleaned.includes('–') || cleaned.includes(':')) {
    const split = cleaned.split(/[-–:]/).map((part) => part.trim()).filter(Boolean);
    if (split.length > 0) {
      cleaned = split[0];
    }
  }
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  if (wordCount > 5) {
    cleaned = cleaned.split(/\s+/).slice(0, 2).join(' ');
  }
  return cleaned.trim();
}

export function splitMedicineNameAndPacking(rawText: string) {
  const normalized = normalizeProductText(rawText);
  if (!normalized) {
    return { name: '', packing: '' };
  }

  const marketingCleaned = stripMarketingText(normalized);

  const dosagePattern = /(.*?)(\b\d{1,4}(?:\.\d{1,2})?\s?(?:mg|gm|gms|kg|ml|ltr)\b.*)$/i;
  const formPattern =
    /(.*?)(\b(?:capsule|capsules|tablet|tablets|tab|tabs|syrup|churna|powder|oil|ointment|cream|gel|drops|lotion|strip|bottle|pack|pouch|tube|box|jar|sachet)\b.*)$/i;

  let name = marketingCleaned;
  let packing = '';

  const dosageMatch = normalized.match(dosagePattern);
  if (dosageMatch) {
    name = dosageMatch[1].trim();
    packing = dosageMatch[2].trim();
  } else {
    const formMatch = normalized.match(formPattern);
    if (formMatch) {
      name = formMatch[1].trim();
      packing = formMatch[2].trim();
    }
  }

  const tokens = name.split(/\s+/).filter(Boolean);
  const cleanedTokens = tokens.filter((token) => {
    const lower = token.toLowerCase();
    const hasNumber = /\d/.test(lower);
    if (hasNumber) {
      packing = `${packing} ${token}`.trim();
      return false;
    }
    if (PACKING_KEYWORDS.includes(lower)) {
      packing = `${packing} ${token}`.trim();
      return false;
    }
    return true;
  });

  const finalName = cleanedTokens.join(' ').trim();
  return {
    name: finalName.length > 40 ? finalName.slice(0, 40).trim() : finalName,
    packing: packing.trim(),
  };
}

function dedupeRows(rows: ParsedMedicineImportRow[]) {
  return Array.from(
    new Map(
      rows.map((row) => [
        `${row.name.toLowerCase()}|${row.company.toLowerCase()}|${row.packing || ''}|${row.barcode || ''}`,
        {
          ...row,
          company: row.company || '',
          category: row.category || '',
          hsn: row.hsn || '',
          barcode: row.barcode || '',
          rackLocation: row.rackLocation || '',
        },
      ])
    ).values()
  );
}

function extractProductsFromTextPages(
  pages: Array<{ text?: string; num?: number }>,
  fileName: string
): ParsedMedicineImportRow[] {
  const documentText = pages.map((page) => page.text || '').join('\n');
  const company = inferCompany(documentText, fileName);
  const rows: ParsedMedicineImportRow[] = [];

  for (const page of pages) {
    const lines = (page.text || '')
      .split('\n')
      .map((line) => normalizeLine(line))
      .filter(Boolean);

    for (let index = 0; index < lines.length; index += 1) {
      let line = lines[index];
      if (!isProductCandidate(line)) {
        continue;
      }

      while (index + 1 < lines.length && shouldMergeWithPrevious(line, lines[index + 1])) {
        line = `${line} ${lines[index + 1]}`;
        index += 1;
      }

      const name = sanitizeProductName(line);
      if (!isProductCandidate(name)) {
        continue;
      }

      const split = splitMedicineNameAndPacking(name);
      rows.push({
        name: split.name || name,
        company,
        category: inferCategory(split.name || name),
        hsn: '',
        barcode: '',
        rackLocation: '',
        packing: split.packing,
        sourceType: 'text-pdf',
      });
    }
  }

  return dedupeRows(rows);
}

async function parseTextPdf(filePath: string, originalName: string) {
  const scriptPath = path.join(process.cwd(), 'scripts', 'text-medicine-import.mjs');

  const rawJson = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, filePath, originalName], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr || `Text PDF script exited with code ${code}`));
    });
  });

  const rows = JSON.parse(rawJson) as ParsedMedicineImportRow[];
  return {
    rows,
    hasUsefulText: rows.length > 0,
  };
}

async function parseOcrPdf(filePath: string, originalName: string) {
  const scriptPath = path.join(process.cwd(), 'scripts', 'ocr-medicine-import.mjs');

  const rawJson = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, filePath, originalName], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr || `OCR script exited with code ${code}`));
    });
  });

  return JSON.parse(rawJson) as ParsedMedicineImportRow[];
}

function parseOcrText(text: string, fileName: string): ParsedMedicineImportRow[] {
  const lines = text
    .split('\n')
    .map((line) => normalizeLine(line))
    .filter(Boolean)
    .filter((line) => !HEADER_PATTERNS.some((pattern) => pattern.test(line)));

  const company = inferCompany(text, fileName);
  const rows: ParsedMedicineImportRow[] = [];

  for (const line of lines) {
    const match = line.match(
      /([0-9]{4,8}\s?[A-Z]?)?\s*([A-Z][A-Z0-9&().,'\/\- ]+?)\s+([0-9]{1,4}\s?(?:CAP|CAPS|CAPSULE|TAB|TABS|TABLET|ML|GM|KG|BOTTLE|PACK|POUCH|TUBE))?\s*([0-9]+(?:\.[0-9]+)?)?/i
    );

    if (!match || !match[2]) {
      continue;
    }

    const name = sanitizeProductName(match[2]);
    if (name.length < 4) {
      continue;
    }

    const split = splitMedicineNameAndPacking(name);
    rows.push({
      name: split.name || name,
      company,
      category: inferCategory(split.name || name),
      hsn: '',
      barcode: match[1]?.trim() || '',
      rackLocation: '',
      packing: split.packing || match[3]?.trim() || '',
      mrp: match[4] ? Number(match[4]) : undefined,
      sourceType: 'image-ocr',
    });
  }

  return dedupeRows(rows);
}

export async function parseMedicineImportFile(file: File, buffer: Buffer) {
  const extension = path.extname(file.name) || '.pdf';
  const tempFilePath = path.join(os.tmpdir(), `ayurstock-import-${randomUUID()}${extension}`);

  await fs.writeFile(tempFilePath, buffer);

  try {
    if (file.type === 'application/pdf') {
      try {
        const textPdf = await parseTextPdf(tempFilePath, file.name);
        if (textPdf.hasUsefulText) {
          return textPdf.rows;
        }
      } catch (error) {
        console.warn('Text PDF parsing failed, falling back to OCR import:', error);
      }

      return await parseOcrPdf(tempFilePath, file.name);
    }

    if (['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      const result = await Tesseract.recognize(buffer, 'eng+hin', { logger: () => {} });
      return parseOcrText(result.data.text || '', file.name);
    }

    throw new Error('Unsupported file type. Please use PDF or image files.');
  } finally {
    await fs.unlink(tempFilePath).catch(() => undefined);
  }
}
