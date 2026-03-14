import fs from 'node:fs';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';

const filePath = process.argv[2];
const fileName = process.argv[3] || path.basename(filePath || 'upload.pdf');

if (!filePath) {
  console.error('Missing file path');
  process.exit(1);
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

function inferCompany(text) {
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

function inferCategory(name) {
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

function isProductCandidate(line) {
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

function shouldMergeWithPrevious(previous, current) {
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

function sanitizeProductName(name) {
  return name
    .replace(/\s+/g, ' ')
    .replace(/\s+\(\s+/g, ' (')
    .trim();
}

function dedupeRows(rows) {
  return Array.from(
    new Map(
      rows.map((row) => [
        `${row.name.toLowerCase()}|${row.company.toLowerCase()}|${row.packing || ''}|${row.barcode || ''}`,
        row,
      ])
    ).values()
  );
}

async function main() {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });

  try {
    const textResult = await parser.getText();
    const pages = textResult.pages || [];
    const documentText = pages.map((page) => page.text || '').join('\n');
    const company = inferCompany(documentText) || titleCase(fileName.replace(/\.[^.]+$/, ''));
    const rows = [];

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

        rows.push({
          name,
          company,
          category: inferCategory(name),
          hsn: '',
          barcode: '',
          rackLocation: '',
          sourceType: 'text-pdf',
        });
      }
    }

    process.stdout.write(JSON.stringify(dedupeRows(rows)));
  } finally {
    await parser.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
