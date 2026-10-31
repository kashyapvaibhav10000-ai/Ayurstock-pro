import { createHash, createHmac, randomBytes, randomInt } from 'crypto';

/**
 * POS PINs and device credentials.
 *
 * A 4-digit PIN has only 10k values, so a slow hash would not stop an offline
 * attack anyway; what protects it is a server-side key. PINs are stored as
 * HMAC-SHA256(PIN_HASH_KEY, shopId:pin): deterministic, so a shop's PIN is
 * found with one indexed lookup and kept unique per shop, and useless
 * without the key. PIN_HASH_KEY is separate from JWT_SECRET so rotating the
 * session secret does not wipe every PIN.
 */
function pinKey(): string {
  const key = process.env.PIN_HASH_KEY || '';
  if (key.length >= 32) return key;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('PIN_HASH_KEY must be set (at least 32 characters).');
  }
  // Development only: derive from JWT_SECRET so local setups keep working.
  return `dev-pin-key:${process.env.JWT_SECRET || ''}`;
}

export function hashPin(shopId: string, pin: string): string {
  return createHmac('sha256', pinKey()).update(`${shopId}:${pin}`).digest('hex');
}

/** SHA-256 for high-entropy secrets (device tokens, pairing codes). */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** 32 random bytes, base64url: the long-lived POS device credential. */
export function newDeviceToken(): string {
  return randomBytes(32).toString('base64url');
}

// No 0/O/1/I/L so codes read cleanly off a screen. 31 symbols ^ 8 ≈ 2^39.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const PAIRING_CODE_LENGTH = 8;

export function newPairingCode(): string {
  let code = '';
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Codes are typed by hand: ignore case, spaces and dashes. */
export function normalizePairingCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== PAIRING_CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}
