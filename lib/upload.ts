/**
 * Upload checks shared by the import routes. The browser-supplied MIME type
 * and file name are only hints; the type is decided from the file's first
 * bytes, and heavy parsing (OCR) is limited so one upload cannot exhaust a
 * small server.
 */

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export type UploadKind = 'pdf' | 'image';
export interface DetectedFile {
  kind: UploadKind;
  mime: 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp';
}

/** File type from magic bytes, or null when it is none of PDF/PNG/JPEG/WebP. */
export function detectFileType(buffer: Buffer): DetectedFile | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { kind: 'pdf', mime: 'application/pdf' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { kind: 'image', mime: 'image/png' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { kind: 'image', mime: 'image/jpeg' };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return { kind: 'image', mime: 'image/webp' };
  }
  return null;
}

const running = new Map<string, number>();

/**
 * Run `fn` only if fewer than `limit` jobs with this key are running in this
 * process; otherwise return { busy: true } without running it. Used to keep
 * OCR (hundreds of MB per job) to one at a time on a 1 GB box.
 */
export async function runLimited<T>(key: string, limit: number, fn: () => Promise<T>): Promise<{ busy: true } | { busy: false; value: T }> {
  const current = running.get(key) ?? 0;
  if (current >= limit) return { busy: true };
  running.set(key, current + 1);
  try {
    return { busy: false, value: await fn() };
  } finally {
    running.set(key, (running.get(key) ?? 1) - 1);
  }
}

/** Reject after `ms`; the caller treats it like a parse failure. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
