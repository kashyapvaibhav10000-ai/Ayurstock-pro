export interface ParsedPurchaseInvoiceItem {
  name: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  purchaseRate: number;
  mrp: number;
}

const HEADER_PATTERNS = [
  /invoice/i,
  /gst/i,
  /hsn/i,
  /qty/i,
  /rate/i,
  /amount/i,
  /batch/i,
  /expiry/i,
  /exp\b/i,
  /mrp/i,
  /total/i,
  /discount/i,
  /tax/i,
];

const EXPIRY_REGEX = /\b(0[1-9]|1[0-2])[\/\-]([0-9]{2,4})\b/;
const BATCH_REGEX = /\b(?:BATCH|B\.?NO\.?|BT)\s*[:\-]?\s*([A-Z0-9\-]+)\b/i;

function normalizeLine(line: string) {
  return line
    .replace(/[|]/g, ' ')
    .replace(/[_=~]+/g, ' ')
    .replace(/\bO(?=\d)/g, '0')
    .replace(/(?<=\d)O\b/g, '0')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseExpiryToIso(expiryToken: string) {
  const match = expiryToken.match(EXPIRY_REGEX);
  if (!match) return '';
  const month = match[1];
  let year = match[2];
  if (year.length === 2) {
    const yearNum = Number(year);
    year = String(yearNum >= 50 ? 1900 + yearNum : 2000 + yearNum);
  }
  return `${year}-${month}-01`;
}

function isHeaderLine(line: string) {
  return HEADER_PATTERNS.some((pattern) => pattern.test(line));
}

function parseLine(line: string): ParsedPurchaseInvoiceItem | null {
  const normalized = normalizeLine(line);
  if (!normalized || normalized.length < 6 || isHeaderLine(normalized)) {
    return null;
  }

  const expMatch = normalized.match(EXPIRY_REGEX);
  if (!expMatch) {
    return null;
  }

  const expiryToken = expMatch[0];
  const expiryDate = parseExpiryToIso(expiryToken);
  const tokens = normalized.split(' ');
  const expIndex = tokens.findIndex((token) => token === expiryToken);

  let batchNumber = '';
  const batchMatch = normalized.match(BATCH_REGEX);
  if (batchMatch?.[1]) {
    batchNumber = batchMatch[1].trim();
  } else if (expIndex > 0) {
    const candidate = tokens
      .slice(0, expIndex)
      .reverse()
      .find((token) => /[A-Z]/i.test(token) && /\d/.test(token));
    batchNumber = candidate || '';
  }

  const qtyIndex = tokens.findIndex((token, index) => {
    if (index <= expIndex) return false;
    return /^\d+$/.test(token);
  });

  if (qtyIndex === -1) {
    return null;
  }

  const quantity = Number(tokens[qtyIndex]);
  const numberTokens = tokens
    .slice(qtyIndex + 1)
    .filter((token) => /^\d+(?:\.\d+)?$/.test(token))
    .map((token) => Number(token));

  if (numberTokens.length === 0) {
    return null;
  }

  const purchaseRate = numberTokens[0] || 0;
  const mrp = numberTokens.length > 1 ? numberTokens[1] : purchaseRate;

  let nameTokens = tokens.slice(0, expIndex);
  if (batchNumber) {
    const batchIndex = tokens.findIndex((token) => token === batchNumber);
    if (batchIndex > 0) {
      nameTokens = tokens.slice(0, batchIndex);
    }
  }

  const name = nameTokens.join(' ').trim();
  if (name.length < 3) {
    return null;
  }

  return {
    name,
    batchNumber,
    expiryDate,
    quantity: Number.isFinite(quantity) ? quantity : 1,
    purchaseRate,
    mrp,
  };
}

export function parsePurchaseInvoiceText(text: string) {
  const lines = text
    .split('\n')
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  const items: ParsedPurchaseInvoiceItem[] = [];

  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed) {
      items.push(parsed);
    }
  }

  return items;
}
