/**
 * Convert a rupee amount into words using the Indian numbering system
 * (lakh / crore), including paise. Used on tax invoices where "Amount in words"
 * is expected on professional/legal bills.
 *
 * Example: 3484.5 -> "Rupees Three Thousand Four Hundred Eighty Four and Fifty Paise Only"
 */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

/** Converts an integer below 1000 into words. */
function threeDigitsToWords(num: number): string {
  let result = '';
  if (num >= 100) {
    result += `${ONES[Math.floor(num / 100)]} Hundred`;
    num %= 100;
    if (num > 0) result += ' ';
  }
  if (num >= 20) {
    result += TENS[Math.floor(num / 10)];
    if (num % 10 > 0) result += ` ${ONES[num % 10]}`;
  } else if (num > 0) {
    result += ONES[num];
  }
  return result;
}

/** Converts a non-negative integer into Indian-system words. */
function integerToWords(num: number): string {
  if (num === 0) return 'Zero';

  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const rest = num;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${threeDigitsToWords(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${threeDigitsToWords(thousand)} Thousand`);
  if (rest > 0) parts.push(threeDigitsToWords(rest));

  return parts.join(' ');
}

/**
 * Full amount-in-words string for an invoice.
 */
export function amountToWords(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return '';

  const rounded = Math.round(amount * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  const rupeeWords = integerToWords(rupees);
  let result = `Rupees ${rupeeWords}`;

  if (paise > 0) {
    result += ` and ${threeDigitsToWords(paise)} Paise`;
  }

  return `${result} Only`;
}
