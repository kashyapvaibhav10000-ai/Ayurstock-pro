/**
 * CSV cell for exports opened in Excel / Sheets. Every cell is quoted, and
 * text starting with = + - @ tab or CR gets a leading ' so a medicine or
 * customer name like =HYPERLINK(...) is shown as text, never run as a formula.
 */
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Header + rows of objects (keys = header order) as CSV text. */
export function toCsv(records: Array<Record<string, unknown>>, lineBreak = '\r\n'): string {
  if (records.length === 0) return '';
  const header = Object.keys(records[0]);
  return [header.map(csvCell).join(','), ...records.map((r) => header.map((h) => csvCell(r[h])).join(','))].join(lineBreak);
}
