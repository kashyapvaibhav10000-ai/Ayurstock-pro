import fs from 'node:fs';
import path from 'node:path';
import Tesseract from 'tesseract.js';
import pdfParse from 'pdf-parse';

const filePath = process.argv[2];
const originalName = process.argv[3] || path.basename(filePath || 'upload');
const mimeType = process.argv[4] || 'application/pdf';

if (!filePath) {
  console.error('Missing file path');
  process.exit(1);
}

const MEDICINE_ROW_PATTERNS = [
  /([0-9]{4,8}\s?[A-Z]?)\s+([A-Z][A-Z0-9&().,'/\- ]+?)\s+([0-9]{1,4}\s?[A-Za-z]{2,12})\s+([0-9]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)/,
  /([0-9]{4,8}\s?[A-Z]?)\s+([A-Z][A-Z0-9&().,'/\- ]+?)\s+([0-9]+\s?(?:Cap|Caps|Tab|Tabs|Bottle|Btl|Ml|GM|Gm|Kg|Pack|Pouch|Tube))\s+([0-9]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)/,
];

const HEADER_IGNORE_PATTERNS = [
  /price list/i,
  /distributor/i,
  /page\s+\d+/i,
  /mrp/i,
  /trade/i,
  /retail/i,
  /packing/i,
  /code/i,
];

function normalizeLine(line) {
  return line
    .replace(/[\u0900-\u097F]+/g, ' ')
    .replace(/[|]/g, ' ')
    .replace(/[“”"]/g, ' ')
    .replace(/[_=~]+/g, ' ')
    .replace(/\bO(?=\d)/g, '0')
    .replace(/(?<=\d)O\b/g, '0')
    .replace(/₹/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTitleCase(value) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function detectCompany(text, fileName) {
  const lines = text.split('\n').map((line) => normalizeLine(line)).filter(Boolean);
  const preferred = lines.find((line) =>
    /ayukalp|himalaya|dabur|baidyanath|patanjali|zandu|charak|sandu|vaidya|herbal|pharma|labs/i.test(line)
  );

  if (preferred) {
    return toTitleCase(preferred.replace(/price list|product list|distributor/gi, '').trim());
  }

  const stem = fileName.replace(/\.[^.]+$/, '');
  const cleanedStem = stem.replace(/[_-]+/g, ' ').replace(/price list|product list|distributor/gi, '').trim();
  return cleanedStem ? toTitleCase(cleanedStem) : 'Distributor';
}

function detectCategory(text) {
  const normalized = text.toLowerCase();
  if (normalized.includes('capsule')) return 'Capsule';
  if (normalized.includes('syrup')) return 'Syrup';
  if (normalized.includes('tablet')) return 'Tablet';
  if (normalized.includes('powder')) return 'Powder';
  return 'General';
}

function isLikelyHeaderOrFooter(line) {
  return HEADER_IGNORE_PATTERNS.some((pattern) => pattern.test(line));
}

function cleanMedicineName(value) {
  return value.replace(/\s+/g, ' ').replace(/\b(?:mrp|trade|retail)\b.*$/i, '').trim();
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
const PACKING_KEYWORDS = new Set([
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
]);

function splitNameAndPacking(rawName) {
  if (!rawName) return { name: '', packing: '' };
  const normalized = rawName.replace(/\s+/g, ' ').trim();
  let cleaned = normalized;
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
  if (cleaned.split(/\s+/).length > 5) {
    cleaned = cleaned.split(/\s+/).slice(0, 2).join(' ');
  }
  const dosagePattern = /(.*?)(\b\d{1,4}(?:\.\d{1,2})?\s?(?:mg|gm|gms|kg|ml|ltr)\b.*)$/i;
  const formPattern =
    /(.*?)(\b(?:capsule|capsules|tablet|tablets|tab|tabs|syrup|churna|powder|oil|ointment|cream|gel|drops|lotion|strip|bottle|pack|pouch|tube|box|jar|sachet)\b.*)$/i;

  let name = cleaned;
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
    if (/\d/.test(lower) || PACKING_KEYWORDS.has(lower)) {
      packing = `${packing} ${token}`.trim();
      return false;
    }
    return true;
  });

  return { name: cleanedTokens.join(' ').trim(), packing: packing.trim() };
}

function parseRow(line) {
  for (const pattern of MEDICINE_ROW_PATTERNS) {
    const match = line.match(pattern);
    if (match) {
      const split = splitNameAndPacking(cleanMedicineName(match[2]));
      return {
        code: match[1].trim(),
        name: split.name || cleanMedicineName(match[2]),
        packing: split.packing || match[3].trim(),
        mrp: parseFloat(match[4]),
        tradePrice: parseFloat(match[5]),
      };
    }
  }

  // Fallback parsing when the line format doesn't match known patterns.
  const normalized = normalizeLine(line);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length < 4) {
    return null;
  }

  const parseNumber = (value) => {
    const cleaned = String(value).replace(/,/g, '').replace(/₹/g, '').trim();
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const maybeMrp = parseNumber(tokens[tokens.length - 1]);
  const maybeTrade = parseNumber(tokens[tokens.length - 2]);
  if (maybeMrp === null || maybeTrade === null) {
    return null;
  }

  let packing = '';
  const remaining = tokens.slice(0, -2);

  // If the last token before prices looks like packaging/quantity, treat it as packing.
  const potentialPacking = remaining[remaining.length - 1] || '';
  if (/(?:tab|tabs|tablet|cap|capsule|caps|syrup|ml|gm|gms|kg|ltr|strip|bottle|pack|pouch|tube|box|jar|sachet)/i.test(potentialPacking) || /\d/.test(potentialPacking)) {
    packing = potentialPacking;
    remaining.pop();
  }

  // If a leading token looks like a product code (alphanumeric with digits), treat it as code.
  let code = '';
  const firstToken = remaining[0] || '';
  if (/^[A-Za-z0-9\-_/]{3,}$/.test(firstToken) && /\d/.test(firstToken)) {
    code = firstToken;
    remaining.shift();
  }

  const rawName = remaining.join(' ');
  const split = splitNameAndPacking(cleanMedicineName(rawName));
  const finalName = split.name || rawName;
  const finalPacking = (split.packing || packing).trim();

  return {
    code: code.trim(),
    name: finalName.trim(),
    packing: finalPacking,
    mrp: maybeMrp,
    tradePrice: maybeTrade,
  };
}

function parseDistributorText(text, company, category) {
  const medicines = [];
  const lines = text.split('\n').map((line) => normalizeLine(line)).filter(Boolean);

  // Group lines into records starting with a typical medicine code (e.g., 91006 K)
  const recordLines = [];
  let currentRecord = [];

  const isCodeLine = (line) => {
    return /^\s*\d{3,8}\s*[A-Z]?\b/.test(line);
  };

  const isPriceLine = (line) => {
    // Detect lines ending with two numbers (retail + trade prices), optionally with packing keywords.
    const match = line.match(/(\d{1,6}(?:\.\d{1,2})?)\s+(\d{1,6}(?:\.\d{1,2})?)\s*$/);
    if (!match) return false;
    return /\b(?:cap|caps|tablet|tab|tabs|syrup|ml|gm|gms|kg|ltr|strip|bottle|pack|pouch|tube|box|jar|sachet)\b/i.test(
      line
    );
  };

  for (const line of lines) {
    if (isLikelyHeaderOrFooter(line)) {
      continue;
    }

    if (isCodeLine(line) || isPriceLine(line)) {
      if (currentRecord.length > 0) {
        recordLines.push(currentRecord);
      }
      currentRecord = [line];
    } else if (currentRecord.length > 0) {
      currentRecord.push(line);
    }
  }

  if (currentRecord.length > 0) {
    recordLines.push(currentRecord);
  }

  for (const record of recordLines) {
    const recordText = record.join(' ');
    const parsed = parseRow(recordText);
    if (!parsed || !parsed.name) {
      continue;
    }

    medicines.push({
      code: parsed.code,
      name: parsed.name,
      packing: parsed.packing,
      mrp: parsed.mrp,
      tradePrice: parsed.tradePrice,
      company,
      category,
    });
  }

  return medicines;
}

async function parsePdfPriceList(buffer, fileName, mimeType) {
  const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;

  // Try text extraction first (for text-based PDFs)
  try {
    const data = await pdfParse(buffer);
    const text = data.text || '';
    if (text.trim()) {
      const company = detectCompany(text, fileName);
      const category = detectCategory(text);
      const medicines = parseDistributorText(text, company, category);
      if (medicines.length > 0) {
        return medicines;
      }
    }
  } catch (error) {
    // Fall back to OCR if text extraction fails
  }

  // Fall back to OCR for scanned/image PDFs
  const { pdf } = await import('pdf-to-img');
  const document = await pdf(dataUrl, { scale: 2.2 });
  const medicines = [];

  for await (const pageImage of document) {
    const imageBuffer = Buffer.isBuffer(pageImage) ? pageImage : Buffer.from(pageImage);
    const ocrResult = await Tesseract.recognize(imageBuffer, 'eng+hin', {
      logger: () => {},
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789₹.,:-/() ',
    });
    const pageText = ocrResult.data.text || '';
    const company = detectCompany(pageText, fileName);
    const category = detectCategory(pageText);
    medicines.push(...parseDistributorText(pageText, company, category));
  }

  return medicines;
}

async function parseImagePriceList(buffer, fileName) {
  const ocrResult = await Tesseract.recognize(buffer, 'eng+hin', {
    logger: () => {},
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789₹.,:-/() ',
  });
  const mergedText = ocrResult.data.text || '';
  const company = detectCompany(mergedText, fileName);
  const category = detectCategory(mergedText);
  return parseDistributorText(mergedText, company, category);
}

async function parseExcelPriceList(buffer) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(worksheet);

  return data
    .map((row) => {
      const medicineRow = row;
      return {
        code: String(medicineRow.code || medicineRow.Code || ''),
        name: String(medicineRow.name || medicineRow.Name || ''),
        company: String(medicineRow.company || medicineRow.Company || 'Distributor'),
        packing: String(medicineRow.packing || medicineRow.Packing || ''),
        mrp: medicineRow.mrp ? parseFloat(String(medicineRow.mrp)) : undefined,
        tradePrice:
          medicineRow.trade_price || medicineRow.tradePrice
            ? parseFloat(String(medicineRow.trade_price || medicineRow.tradePrice))
            : undefined,
        category: String(medicineRow.category || medicineRow.Category || 'General'),
      };
    })
    .filter((medicine) => medicine.name && medicine.company);
}

function dedupeMedicines(medicines) {
  return Array.from(
    new Map(
      medicines.map((medicine) => [
        `${medicine.code || ''}:${medicine.name}:${medicine.packing || ''}`,
        medicine,
      ])
    ).values()
  );
}

async function main() {
  const buffer = fs.readFileSync(filePath);
  let medicines = [];

  if (mimeType === 'application/pdf') {
    medicines = await parsePdfPriceList(buffer, originalName, mimeType);
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    medicines = await parseExcelPriceList(buffer);
  } else if (['image/png', 'image/jpeg', 'image/jpg'].includes(mimeType)) {
    medicines = await parseImagePriceList(buffer, originalName);
  } else {
    throw new Error('Unsupported file type. Use PDF, Excel, or image files.');
  }

  const parsedMedicines = dedupeMedicines(medicines).filter(
    (medicine) => medicine.name && medicine.company && typeof medicine.mrp === 'number'
  );

  process.stdout.write(JSON.stringify(parsedMedicines));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
