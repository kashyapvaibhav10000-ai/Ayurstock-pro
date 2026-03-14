import fs from 'node:fs';
import Tesseract from 'tesseract.js';
import { pdf } from 'pdf-to-img';
import sharp from 'sharp';

const filePath = process.argv[2];
const fileName = process.argv[3] || 'upload.pdf';

if (!filePath) {
  console.error('Missing file path');
  process.exit(1);
}

const CODE_LINE_PATTERN = /^(\d{5,6}\s?[A-Z#?]?)\b\s*(.*)$/;
const PACKING_PATTERN =
  /\b(\d{1,4}\s?(?:CAP|CAPS|CAPSULE|TAB|TABS|TABLET|ML|MI|GM|GMS|KG|BOTTLE|BTL|PACK|POUCH|TUBE|TAS|TAC))\b/i;
const PRICE_PAIR_PATTERN =
  /(\d{2,4}(?:\.\d{1,2})?)\D+(\d{2,4}(?:\.\d{1,2})?)(?!\D+\d)/;
const MEDICINE_NAME_PATTERN =
  /\b([A-Z][A-Z0-9&().,'\/\- ]{2,}?(?:CAPSULE|TABLET|SYRUP|OIL|CHURNA|CAP|CAPS|TAB|TABS|TONIC|GEL|LEHYA|VATI|GUTIKA|RASA|LOHA|ASAVA|ARISHTA|PAK|GRANULES|KWATH|BATI|PRASH|MODAK|MANDUR))\b/;
const HEADER_PATTERNS = [
  /price list/i,
  /product name/i,
  /retail/i,
  /trade/i,
  /packing/i,
  /code/i,
  /page\s+\d+/i,
  /all kinds of/i,
  /patent medicine/i,
];

const STOP_NAME_TOKENS = new Set([
  'CAP',
  'CAPS',
  'CAPSULE',
  'TAB',
  'TABS',
  'TABLET',
  'ML',
  'MI',
  'GM',
  'GMS',
  'KG',
  'BOTTLE',
  'BTL',
  'PACK',
  'POUCH',
  'TUBE',
  'PRICE',
  'TRADE',
  'MRP',
]);

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
function normalizeLine(line) {
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

function titleCase(value) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isHeaderLike(line) {
  return HEADER_PATTERNS.some((pattern) => pattern.test(line));
}

function detectCompany(text, fallbackFileName) {
  const line = text
    .split('\n')
    .map((entry) => normalizeLine(entry))
    .find((entry) =>
      /ayukalp|himalaya|dabur|baidyanath|patanjali|zandu|charak|sandu|vaidya|herbal|pharma|labs/i.test(
        entry
      )
    );

  if (line) {
    const cleaned = line
      .replace(/price list|product list|distributor|patent/gi, '')
      .replace(/\b(?:code|product|packing|retail|trade)\b.*$/i, '')
      .trim();
    if (cleaned) {
      return titleCase(cleaned);
    }
  }

  const stem = fallbackFileName.replace(/\.[^.]+$/, '');
  const cleanedStem = stem.replace(/[_-]+/g, ' ').replace(/price list/gi, '').trim();
  return cleanedStem ? titleCase(cleanedStem) : 'Distributor';
}

function detectCategory(name, blockText) {
  const normalized = `${name} ${blockText}`.toLowerCase();
  if (normalized.includes('capsule')) return 'Capsule';
  if (normalized.includes('tablet') || normalized.includes('gutika') || normalized.includes('vati')) {
    return 'Tablet';
  }
  if (normalized.includes('syrup') || normalized.includes('asava') || normalized.includes('arishta')) {
    return 'Syrup';
  }
  if (normalized.includes('oil')) return 'Oil';
  if (normalized.includes('gel')) return 'Gel';
  if (normalized.includes('churna')) return 'Churna';
  return 'General';
}

function sanitizeName(name) {
  return name
    .replace(/\b(?:GOOD FOR|USEFUL FOR|FOR|DISORDERS?|ACIDITY|WEAKNESS|COUGH|COLD)\b.*$/i, '')
    .replace(/\b\d{1,4}\s?(?:CAP|CAPS|CAPSULE|TAB|TABS|TABLET|ML|MI|GM|GMS|KG|BOTTLE|BTL|PACK|POUCH|TUBE|TAS|TAC)\b.*$/i, '')
    .replace(/\b\d+(?:\.\d{1,2})?\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const PACKING_KEYWORDS = new Set([
  'CAP',
  'CAPS',
  'CAPSULE',
  'TAB',
  'TABS',
  'TABLET',
  'ML',
  'MI',
  'GM',
  'GMS',
  'KG',
  'BOTTLE',
  'BTL',
  'PACK',
  'POUCH',
  'TUBE',
  'OIL',
  'SYRUP',
  'CHURNA',
  'POWDER',
  'CREAM',
  'GEL',
  'DROP',
  'DROPS',
  'BOX',
  'JAR',
  'SACHET',
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

  let name = normalized;
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
    const upper = token.toUpperCase();
    if (/\d/.test(token) || PACKING_KEYWORDS.has(upper)) {
      packing = `${packing} ${token}`.trim();
      return false;
    }
    return true;
  });

  return { name: cleanedTokens.join(' ').trim(), packing: packing.trim() };
}

function extractUppercaseName(value) {
  const cleaned = value.replace(/^\d{5,6}\s?[A-Z#?]?\s*/, '').trim();
  const tokens = cleaned.split(/\s+/);
  const result = [];

  for (const token of tokens) {
    const plain = token.replace(/[^A-Za-z]/g, '');
    const upper = plain.toUpperCase();
    const uppercaseCount = plain.replace(/[^A-Z]/g, '').length;
    const uppercaseRatio = plain ? uppercaseCount / plain.length : 0;

    if (!plain) {
      break;
    }

    if (STOP_NAME_TOKENS.has(upper)) {
      break;
    }

    if (/\d/.test(token) && result.length > 0) {
      break;
    }

    if (plain.length >= 2 && uppercaseRatio >= 0.5) {
      result.push(token.replace(/[^A-Za-z0-9&().,'\/\-]/g, '').toUpperCase());
      continue;
    }

    break;
  }

  return sanitizeName(result.join(' '));
}

function isLikelyMedicineName(name) {
  if (!name || name.length < 5) {
    return false;
  }

  if (/\b(?:GOOD FOR|USEFUL FOR|DRY AND|BLOOD|URINARY|WEAKNESS|ACIDITY|PILES|DIABETES|BURNING|COUGH|COLD|DISORDER)\b/i.test(name)) {
    return false;
  }

  if (MEDICINE_NAME_PATTERN.test(name)) {
    return true;
  }

  const letters = name.replace(/[^A-Za-z]/g, '');
  if (letters.length < 5) {
    return false;
  }

  const uppercaseLetters = letters.replace(/[^A-Z]/g, '').length;
  const uppercaseRatio = uppercaseLetters / letters.length;
  return uppercaseRatio >= 0.45 && name.split(/\s+/).length >= 1;
}

function extractNameFromBlock(lines, firstLineRemainder) {
  const firstLineUppercase = extractUppercaseName(firstLineRemainder);
  if (isLikelyMedicineName(firstLineUppercase)) {
    return firstLineUppercase;
  }

  const candidates = [firstLineRemainder, ...lines];

  for (const candidate of candidates) {
    const match = candidate.match(MEDICINE_NAME_PATTERN);
    if (match) {
      const cleaned = sanitizeName(match[1]);
      if (isLikelyMedicineName(cleaned)) {
        return cleaned;
      }
    }
  }

  for (const candidate of candidates) {
    const cleaned = extractUppercaseName(candidate);
    if (isLikelyMedicineName(cleaned)) {
      return cleaned;
    }
  }

  const relaxedCandidates = [firstLineRemainder, ...lines];
  for (const candidate of relaxedCandidates) {
    const cleaned = sanitizeName(extractUppercaseName(candidate) || candidate.replace(/^\d{5,6}\s?[A-Z#?]?\s*/, ''));
    if (cleaned && cleaned.length >= 5 && !/\d{2,}/.test(cleaned)) {
      return cleaned;
    }
  }

  return '';
}

function extractPacking(blockText) {
  const match = blockText.match(PACKING_PATTERN);
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

function normalizePrice(value) {
  if (!value) return NaN;
  const digits = value.replace(/[^\d.]/g, '');
  if (!digits) return NaN;
  if (digits.includes('.')) return Number(digits);
  if (digits.length >= 3) return Number(`${digits.slice(0, -2)}.${digits.slice(-2)}`);
  return Number(digits);
}

function extractPrices(blockText) {
  const priceMatches = Array.from(blockText.matchAll(/(\d{2,5}(?:\.\d{1,2})?)/g)).map((match) =>
    normalizePrice(match[1])
  );
  const filtered = priceMatches.filter((value) => Number.isFinite(value) && value >= 10 && value <= 500);

  for (let index = 0; index < filtered.length - 1; index += 1) {
    const mrp = filtered[index];
    const tradePrice = filtered[index + 1];
    if (tradePrice <= mrp) {
      return { mrp, tradePrice };
    }
  }

  const pair = blockText.match(PRICE_PAIR_PATTERN);
  if (pair) {
    const mrp = normalizePrice(pair[1]);
    const tradePrice = normalizePrice(pair[2]);
    if (Number.isFinite(mrp) && Number.isFinite(tradePrice) && tradePrice <= mrp) {
      return { mrp, tradePrice };
    }
  }

  return { mrp: undefined, tradePrice: undefined };
}

function parseLineEntry(line, company) {
  const codeMatch = line.match(CODE_LINE_PATTERN);
  if (!codeMatch) {
    return null;
  }

  const code = codeMatch[1].replace(/\s+/g, ' ').trim();
  const remainder = codeMatch[2] || '';
  const name =
    extractUppercaseName(remainder) ||
    sanitizeName(remainder.replace(/\b\d+(?:\.\d{1,2})?\b.*$/, '').trim());

  if (!name || name.length < 4) {
    return null;
  }

  const split = splitNameAndPacking(name);
  const packing = split.packing || extractPacking(remainder);
  const { mrp, tradePrice } = extractPrices(remainder);

  return {
    name: split.name || name,
    company,
    category: detectCategory(split.name || name, remainder),
    barcode: code,
    hsn: '',
    rackLocation: '',
    packing,
    mrp,
    tradePrice,
  };
}

function parseColumnText(text, fileName) {
  const rawLines = text
    .split('\n')
    .map((line) => normalizeLine(line))
    .filter((line) => line && !isHeaderLike(line));
  const company = detectCompany(text, fileName);
  const medicines = [];

  for (const line of rawLines) {
    const parsedLineEntry = parseLineEntry(line, company);
    if (parsedLineEntry) {
      medicines.push(parsedLineEntry);
    }
  }

  for (let index = 0; index < rawLines.length; index += 1) {
    const line = rawLines[index];
    const codeMatch = line.match(CODE_LINE_PATTERN);
    if (!codeMatch) {
      continue;
    }

    const blockLines = [line];
    let lookahead = index + 1;
    while (lookahead < rawLines.length && !CODE_LINE_PATTERN.test(rawLines[lookahead])) {
      blockLines.push(rawLines[lookahead]);
      lookahead += 1;
    }

    const blockText = blockLines.join(' ');
    const code = codeMatch[1].replace(/\s+/g, ' ').trim();
    const name = extractNameFromBlock(blockLines.slice(1), codeMatch[2] || '');

    if (!isLikelyMedicineName(name)) {
      continue;
    }

    const priceText = blockText.replace(code, '').replace(name, '');
    const split = splitNameAndPacking(name);
    const packing = split.packing || extractPacking(priceText);
    const { mrp, tradePrice } = extractPrices(priceText);

    medicines.push({
      name: split.name || name,
      company,
      category: detectCategory(split.name || name, blockText),
      barcode: code,
      hsn: '',
      rackLocation: '',
      packing,
      mrp,
      tradePrice,
    });
  }

  return medicines;
}

function dedupeMedicines(medicines) {
  const scoreMedicine = (medicine) => {
    let score = 0;
    if (medicine.name) score += Math.min(medicine.name.length, 30);
    if (MEDICINE_NAME_PATTERN.test(medicine.name || '')) score += 40;
    if (medicine.packing) score += 15;
    if (typeof medicine.mrp === 'number') score += 10;
    if (typeof medicine.tradePrice === 'number') score += 10;
    if (!/\b(?:ACIDITY|WEAKNESS|COUGH|COLD|BLOOD|PILES|URINARY|DISORDER|GOOD FOR|USEFUL FOR|DIABETES|LIVER)\b/i.test(medicine.name || '')) {
      score += 20;
    }
    if (/^[A-Z0-9&().,'\/\- ]+$/.test(medicine.name || '')) score += 10;
    if ((medicine.name || '').length < 5) score -= 20;
    if ((medicine.name || '').includes('&')) score -= 5;
    return score;
  };

  const deduped = Array.from(
    new Map(
      medicines.map((medicine) => [
        `${medicine.barcode || ''}:${(medicine.name || '').toLowerCase()}:${medicine.packing || ''}`,
        medicine,
      ])
    ).values()
  ).sort((left, right) => scoreMedicine(right) - scoreMedicine(left));

  return deduped;
}

async function splitPageColumns(pageBuffer, topOffset) {
  const image = sharp(pageBuffer);
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const safeTopOffset = Math.min(topOffset, Math.max(height - 10, 0));
  const leftWidth = Math.floor(width / 2);

  return Promise.all([
    sharp(pageBuffer)
      .extract({ left: 0, top: safeTopOffset, width: leftWidth, height: height - safeTopOffset })
      .png()
      .toBuffer(),
    sharp(pageBuffer)
      .extract({
        left: leftWidth,
        top: safeTopOffset,
        width: width - leftWidth,
        height: height - safeTopOffset,
      })
      .png()
      .toBuffer(),
  ]);
}

async function main() {
  const buffer = fs.readFileSync(filePath);
  const medicines = [];
  const passes = [
    { scale: 2, topOffset: 120 },
    { scale: 3, topOffset: 170 },
  ];

  for (const pass of passes) {
    const dataUrl = `data:application/pdf;base64,${buffer.toString('base64')}`;
    const document = await pdf(dataUrl, { scale: pass.scale });

    for await (const pageImage of document) {
      const imageBuffer = Buffer.isBuffer(pageImage) ? pageImage : Buffer.from(pageImage);
      const columns = await splitPageColumns(imageBuffer, pass.topOffset);

      for (const columnImage of columns) {
        const ocrResult = await Tesseract.recognize(columnImage, 'eng+hin', { logger: () => {} });
        medicines.push(...parseColumnText(ocrResult.data.text || '', fileName));
      }
    }
  }

  process.stdout.write(JSON.stringify(dedupeMedicines(medicines)));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
