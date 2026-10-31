import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { AiFeature, AiProvider } from '@prisma/client';
import { prisma } from '@/lib/db';
import { AdapterId, getAdapter, legacyAdapter } from '@/lib/ai/providers';

/**
 * AI provider vault.
 *
 * Each AiProviderKey row is a provider instance: an adapter (API format),
 * optional model / base URL and an encrypted key. Keys are AES-256-GCM
 * encrypted with AI_ENCRYPTION_KEY (32 bytes, hex or base64, env only).
 * Decrypted keys live only in this process's memory cache and are never
 * returned by any API or written to logs.
 *
 * Key per instance: stored key -> .env key (only the instance holding one of
 * the four original providers' slot) -> none (instance skipped).
 * The chain is the enabled instances with a key, by priority (lower first),
 * unless a feature has its own order (AiFeatureRoute).
 */

export const AI_PROVIDERS: AiProvider[] = ['GEMINI', 'GROQ', 'MISTRAL', 'OPENROUTER'];

const ENV_VAR: Record<AiProvider, string> = {
  GEMINI: 'GEMINI_API_KEY',
  GROQ: 'GROQ_API_KEY',
  MISTRAL: 'MISTRAL_API_KEY',
  OPENROUTER: 'OPENROUTER_API_KEY',
};

// Chain used when the database cannot be read (historical parser order).
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

/**
 * Additional authenticated data binding a ciphertext to its row: the legacy
 * provider name (keeps keys stored before instances existed decryptable),
 * else the instance id. A ciphertext copied onto another row fails to decrypt.
 */
export function keyAad(row: { id: string; provider: AiProvider | null }): string {
  return row.provider ?? row.id;
}

export function encryptKey(aad: string, plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    encryptedKey: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    last4: plaintext.slice(-4),
  };
}

function decryptKey(aad: string, row: { encryptedKey: string; iv: string; authTag: string }): string {
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(row.iv, 'base64'));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(row.authTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(row.encryptedKey, 'base64')), decipher.final()]).toString('utf8');
}

type KeyRow = { id: string; provider: AiProvider | null; encryptedKey: string | null; iv: string | null; authTag: string | null };

function storedKey(row: KeyRow): string | null {
  if (!row.encryptedKey || !row.iv || !row.authTag) return null;
  return decryptKey(keyAad(row), { encryptedKey: row.encryptedKey, iv: row.iv, authTag: row.authTag });
}

// ─── Resolution cache ─────────────────────────────────────────────────────────

export interface AiInstance {
  id: string;
  adapter: AdapterId;
  displayName: string;
  model: string | null;
  baseUrl: string | null;
  /** Original provider slot held by this instance (owns the .env fallback). */
  provider: AiProvider | null;
  enabled: boolean;
  priority: number;
  key: string | null;
  keySource: 'db' | 'env' | null;
}

interface Snapshot {
  instances: AiInstance[];
  routes: Partial<Record<AiFeature, string[]>>;
  loadedAt: number;
}

// Changes made through this process invalidate immediately; the TTL covers
// changes made by another server process.
const CACHE_TTL_MS = 60_000;
let cache: Snapshot | null = null;
let loading: Promise<Snapshot> | null = null;

export function invalidateAiKeyCache() {
  cache = null;
  loading = null;
}

export function instanceName(row: { displayName: string | null; adapter: string }): string {
  return row.displayName || getAdapter(row.adapter)?.name || row.adapter;
}

/** Instances built from .env alone, for when the database is unreachable. */
function envOnlyInstances(): AiInstance[] {
  return DEFAULT_ORDER.map((provider, priority) => {
    const key = envKey(provider);
    return {
      id: `env:${provider}`,
      adapter: provider,
      displayName: legacyAdapter(provider).name,
      model: null,
      baseUrl: null,
      provider,
      enabled: true,
      priority,
      key,
      keySource: key ? ('env' as const) : null,
    };
  });
}

async function load(): Promise<Snapshot> {
  let rows: Awaited<ReturnType<typeof prisma.aiProviderKey.findMany>>;
  try {
    rows = await prisma.aiProviderKey.findMany({ orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] });
  } catch (error) {
    console.error('AI key load failed; using .env keys only:', error instanceof Error ? error.message : 'unknown error');
    return { instances: envOnlyInstances(), routes: {}, loadedAt: Date.now() };
  }

  const instances: AiInstance[] = [];
  for (const row of rows) {
    if (!getAdapter(row.adapter)) {
      console.error(`AI instance ${row.id} has unknown adapter ${row.adapter}; skipped`);
      continue;
    }
    let key: string | null = null;
    let keySource: AiInstance['keySource'] = null;
    try {
      key = storedKey(row);
      if (key) keySource = 'db';
    } catch {
      console.error(`AI key for ${instanceName(row)} could not be decrypted; falling back to .env`);
    }
    if (!key && row.provider) {
      key = envKey(row.provider);
      if (key) keySource = 'env';
    }
    instances.push({
      id: row.id,
      adapter: row.adapter as AdapterId,
      displayName: instanceName(row),
      model: row.model,
      baseUrl: row.baseUrl,
      provider: row.provider,
      enabled: row.enabled,
      priority: row.priority,
      key,
      keySource,
    });
  }

  const routes: Snapshot['routes'] = {};
  try {
    for (const route of await prisma.aiFeatureRoute.findMany()) {
      if (route.instanceIds.length) routes[route.feature] = route.instanceIds;
    }
  } catch (error) {
    console.error('AI feature routes load failed; using the global chain:', error instanceof Error ? error.message : 'unknown error');
  }

  return { instances, routes, loadedAt: Date.now() };
}

/** Refresh the in-memory snapshot if stale. Call before aiInstances()/aiChain(). */
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

/** Every instance, in global chain order (enabled or not, with or without key). */
export function aiInstances(): AiInstance[] {
  return cache?.instances ?? envOnlyInstances();
}

/** Custom provider order for a feature, or null when it uses the global chain. */
export function aiFeatureRoute(feature: AiFeature): string[] | null {
  return cache?.routes[feature] ?? null;
}

/**
 * Instances a feature calls, in order: its custom order if set, else the
 * global chain. Disabled instances and instances without a key are left out.
 */
export function aiChain(feature: AiFeature): AiInstance[] {
  const usable = (instance: AiInstance | undefined): instance is AiInstance => Boolean(instance?.enabled && instance.key);
  const instances = aiInstances();
  const route = aiFeatureRoute(feature);
  if (!route) return instances.filter(usable);
  const byId = new Map(instances.map((instance) => [instance.id, instance]));
  return route.map((id) => byId.get(id)).filter(usable);
}

/** Decrypt the stored key for a test. Server-only; never returned to clients. */
export async function storedKeyForTest(id: string): Promise<{ key: string; source: 'db' | 'env' } | null> {
  const row = await prisma.aiProviderKey.findUnique({ where: { id } });
  if (!row) return null;
  const key = storedKey(row);
  if (key) return { key, source: 'db' };
  const fromEnv = row.provider ? envKey(row.provider) : null;
  return fromEnv ? { key: fromEnv, source: 'env' } : null;
}
