import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { AiProvider } from '@prisma/client';
import { prisma } from '@/lib/db';

/**
 * AI provider key vault.
 *
 * Keys are AES-256-GCM encrypted with AI_ENCRYPTION_KEY (32 bytes, hex or
 * base64, env only). Decrypted keys live only in this process's memory
 * cache and are never returned by any API or written to logs.
 *
 * Resolution per provider: enabled DB key -> .env key -> provider skipped.
 * Chain order follows AiProviderKey.priority (lower first).
 */

export const AI_PROVIDERS: AiProvider[] = ['GEMINI', 'GROQ', 'MISTRAL', 'OPENROUTER'];

const ENV_VAR: Record<AiProvider, string> = {
  GEMINI: 'GEMINI_API_KEY',
  GROQ: 'GROQ_API_KEY',
  MISTRAL: 'MISTRAL_API_KEY',
  OPENROUTER: 'OPENROUTER_API_KEY',
};

// Default chain when no priorities are stored (matches the parser's
// historical order: Gemini, Mistral, Groq, OpenRouter).
const DEFAULT_ORDER: AiProvider[] = ['GEMINI', 'MISTRAL', 'GROQ', 'OPENROUTER'];

export function envKey(provider: AiProvider): string | null {
  const value = process.env[ENV_VAR[provider]];
  return value && value.trim() ? value.trim() : null;
}

// ─── Encryption ───────────────────────────────────────────────────────────────

function masterKey(): Buffer {
  const raw = process.env.AI_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error('AI_ENCRYPTION_KEY is not set');
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('AI_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)');
  return key;
}

export function isVaultConfigured(): boolean {
  try {
    masterKey();
    return true;
  } catch {
    return false;
  }
}

// The provider name is bound as additional authenticated data, so a
// ciphertext copied onto another provider's row fails to decrypt.
export function encryptKey(provider: AiProvider, plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  cipher.setAAD(Buffer.from(provider));
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    encryptedKey: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    last4: plaintext.slice(-4),
  };
}

function decryptKey(provider: AiProvider, row: { encryptedKey: string; iv: string; authTag: string }): string {
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(row.iv, 'base64'));
  decipher.setAAD(Buffer.from(provider));
  decipher.setAuthTag(Buffer.from(row.authTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(row.encryptedKey, 'base64')), decipher.final()]).toString('utf8');
}

// ─── Resolution cache ─────────────────────────────────────────────────────────

interface ResolvedKeys {
  keys: Partial<Record<AiProvider, { key: string; source: 'db' | 'env' }>>;
  order: AiProvider[];
  loadedAt: number;
}

// Changes made through this process invalidate immediately; the TTL covers
// changes made by another server process.
const CACHE_TTL_MS = 60_000;
let cache: ResolvedKeys | null = null;
let loading: Promise<ResolvedKeys> | null = null;

export function invalidateAiKeyCache() {
  cache = null;
  loading = null;
}

async function load(): Promise<ResolvedKeys> {
  let rows: Awaited<ReturnType<typeof prisma.aiProviderKey.findMany>> = [];
  try {
    rows = await prisma.aiProviderKey.findMany();
  } catch (error) {
    console.error('AI key load failed; using .env keys only:', error instanceof Error ? error.message : 'unknown error');
  }
  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  const keys: ResolvedKeys['keys'] = {};
  for (const provider of AI_PROVIDERS) {
    const row = byProvider.get(provider);
    if (row?.enabled && row.encryptedKey && row.iv && row.authTag) {
      try {
        keys[provider] = { key: decryptKey(provider, { encryptedKey: row.encryptedKey, iv: row.iv, authTag: row.authTag }), source: 'db' };
        continue;
      } catch {
        console.error(`AI key for ${provider} could not be decrypted; falling back to .env`);
      }
    }
    const fromEnv = envKey(provider);
    if (fromEnv) keys[provider] = { key: fromEnv, source: 'env' };
  }

  const rank = (provider: AiProvider) => {
    const row = byProvider.get(provider);
    return row ? row.priority : 1000 + DEFAULT_ORDER.indexOf(provider);
  };
  const order = [...AI_PROVIDERS].sort((a, b) => rank(a) - rank(b) || DEFAULT_ORDER.indexOf(a) - DEFAULT_ORDER.indexOf(b));

  return { keys, order, loadedAt: Date.now() };
}

/** Refresh the in-memory key snapshot if stale. Call before using aiKey(). */
export async function loadAiKeys(): Promise<void> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return;
  if (!loading) {
    loading = load().then((result) => {
      cache = result;
      loading = null;
      return result;
    });
  }
  await loading;
}

/** Resolved key for a provider from the last snapshot (null = skip provider). */
export function aiKey(provider: AiProvider): string | null {
  if (cache) return cache.keys[provider]?.key ?? null;
  return envKey(provider);
}

export function aiKeySource(provider: AiProvider): 'db' | 'env' | null {
  return cache?.keys[provider]?.source ?? (envKey(provider) ? 'env' : null);
}

/** Fallback chain order of the managed providers. */
export function aiProviderOrder(): AiProvider[] {
  return cache?.order ?? DEFAULT_ORDER;
}

/**
 * Reorder a provider chain by priority, keeping providers that are not
 * managed here (e.g. Cerebras, Cloudflare) in their original slots.
 */
export function orderByPriority<T>(items: T[], providerOf: (item: T) => AiProvider | null): T[] {
  const order = aiProviderOrder();
  const managed = items
    .filter((item) => providerOf(item) !== null)
    .sort((a, b) => order.indexOf(providerOf(a)!) - order.indexOf(providerOf(b)!));
  let next = 0;
  return items.map((item) => (providerOf(item) !== null ? managed[next++] : item));
}

// ─── Key test ─────────────────────────────────────────────────────────────────

const TEST_TIMEOUT_MS = 10_000;

/**
 * Minimal authenticated call per provider (model / key listing; no tokens
 * spent). Error text is scrubbed of the key before being returned.
 */
export async function testProviderKey(provider: AiProvider, key: string): Promise<{ ok: boolean; latencyMs: number; error: string | null }> {
  const request: { url: string; headers: Record<string, string> } =
    provider === 'GEMINI'
      ? { url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', headers: { 'x-goog-api-key': key } }
      : provider === 'GROQ'
        ? { url: 'https://api.groq.com/openai/v1/models', headers: { Authorization: `Bearer ${key}` } }
        : provider === 'MISTRAL'
          ? { url: 'https://api.mistral.ai/v1/models', headers: { Authorization: `Bearer ${key}` } }
          : { url: 'https://openrouter.ai/api/v1/key', headers: { Authorization: `Bearer ${key}` } };

  const scrub = (text: string) => (key ? text.split(key).join('[redacted]') : text).slice(0, 300);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(request.url, { headers: request.headers, signal: controller.signal, cache: 'no-store' });
    const latencyMs = Date.now() - started;
    if (res.ok) return { ok: true, latencyMs, error: null };
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      const detail = body?.error?.message || body?.message || body?.detail;
      if (detail) message += `: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
    } catch {
      // non-JSON error body; status is enough
    }
    return { ok: false, latencyMs, error: scrub(message) };
  } catch (error) {
    const latencyMs = Date.now() - started;
    const aborted = error instanceof Error && error.name === 'AbortError';
    return { ok: false, latencyMs, error: aborted ? 'Timed out after 10s' : scrub(error instanceof Error ? error.message : 'Request failed') };
  } finally {
    clearTimeout(timer);
  }
}

/** Decrypt the stored key for a test. Server-only; never returned to clients. */
export async function storedKeyForTest(provider: AiProvider): Promise<{ key: string; source: 'db' | 'env' } | null> {
  const row = await prisma.aiProviderKey.findUnique({ where: { provider } });
  if (row?.encryptedKey && row.iv && row.authTag) {
    return { key: decryptKey(provider, { encryptedKey: row.encryptedKey, iv: row.iv, authTag: row.authTag }), source: 'db' };
  }
  const fromEnv = envKey(provider);
  return fromEnv ? { key: fromEnv, source: 'env' } : null;
}
