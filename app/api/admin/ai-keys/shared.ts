import { AiProvider } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { AI_PROVIDERS, aiFeatureRoute, aiInstances, envKey, instanceName, isVaultConfigured, loadAiKeys } from '@/lib/ai-keys';
import { AI_FEATURES, AI_FEATURE_LABEL } from '@/lib/ai/features';
import { AI_ADAPTERS, describeAdapter, getAdapter } from '@/lib/ai/providers';
import { aiUsageStats } from '@/lib/ai/usage-log';
import { AuthUser } from '@/types';
import { assertPublicHttpsUrl } from '@/lib/net-guard';

export function forbidden() {
  // 404 rather than 403 so the endpoint is not advertised to non-super-admins.
  return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
}

export function badRequest(message: string) {
  return NextResponse.json({ success: false, message }, { status: 400 });
}

export function parseProvider(value: unknown): AiProvider | null {
  return typeof value === 'string' && (AI_PROVIDERS as string[]).includes(value) ? (value as AiProvider) : null;
}

/** Instance row from { id } or, for older clients, the legacy { provider }. */
export async function findInstance(input: { id?: unknown; provider?: unknown }) {
  if (typeof input.id === 'string' && input.id) return prisma.aiProviderKey.findUnique({ where: { id: input.id } });
  const provider = parseProvider(input.provider);
  return provider ? prisma.aiProviderKey.findUnique({ where: { provider } }) : null;
}

type AuditTarget = { id: string; provider: AiProvider | null; displayName: string | null; adapter: string };

export async function audit(user: AuthUser, target: AuditTarget | null, action: string, detail?: string | null) {
  await prisma.aiKeyAuditLog.create({
    data: {
      provider: target?.provider ?? null,
      instanceId: target?.id ?? null,
      instanceName: target ? instanceName(target) : null,
      action,
      detail: detail ?? null,
      userId: user.id,
      userEmail: user.email,
    },
  });
}

export function validateKey(value: unknown): { key: string } | { error: string } {
  const key = typeof value === 'string' ? value.trim() : '';
  if (key.length < 8 || key.length > 512 || /\s/.test(key)) return { error: 'Key looks invalid (8-512 characters, no spaces)' };
  return { key };
}

/** Optional short text field: undefined = not sent, null = cleared. */
export function optionalText(value: unknown, max: number): string | null | undefined | false {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > max) return false;
  return value.trim() || null;
}

/**
 * Base URLs receive the API key, so only https (no credentials) to a public
 * address is accepted. DNS is checked again on every call (lib/ai/providers/http.ts).
 */
export async function validateBaseUrl(value: string | null): Promise<string | null | false> {
  if (value === null) return null;
  try {
    await assertPublicHttpsUrl(value);
    return new URL(value).toString().replace(/\/+$/, '');
  } catch {
    return false;
  }
}

/** Card state for every instance. Only metadata — never key material. */
async function providerCards() {
  await loadAiKeys();
  const rows = await prisma.aiProviderKey.findMany({
    select: {
      id: true,
      last4: true,
      encryptedKey: true,
      lastTestedAt: true,
      lastTestOk: true,
      lastLatencyMs: true,
      lastError: true,
      updatedAt: true,
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const instances = aiInstances().filter((instance) => byId.has(instance.id));
  const usage = await aiUsageStats(instances.map((instance) => instance.id));

  const usedBy = (id: string, enabled: boolean) =>
    AI_FEATURES.filter((feature) => {
      const route = aiFeatureRoute(feature);
      return route ? route.includes(id) : enabled;
    });

  const cards = instances.map((instance, index) => {
    const row = byId.get(instance.id)!;
    const adapter = getAdapter(instance.adapter)!;
    return {
      id: instance.id,
      provider: instance.provider,
      adapter: instance.adapter,
      displayName: instance.displayName,
      model: instance.model,
      baseUrl: instance.baseUrl,
      defaultModel: adapter.defaultModel,
      supportsPdf: adapter.supportsPdf,
      supportsImage: adapter.supportsImage,
      priority: index,
      hasDbKey: Boolean(row.encryptedKey),
      last4: row.encryptedKey ? row.last4 : null,
      enabled: instance.enabled,
      envKeyPresent: Boolean(instance.provider && envKey(instance.provider)),
      activeSource: instance.keySource,
      lastTestedAt: row.lastTestedAt,
      lastTestOk: row.lastTestOk,
      lastLatencyMs: row.lastLatencyMs,
      lastError: row.lastError,
      updatedAt: row.updatedAt,
      usedBy: usedBy(instance.id, instance.enabled),
      callsToday: usage.instances[instance.id]?.callsToday ?? {},
      lastCallError: usage.instances[instance.id]?.lastError ?? null,
    };
  });

  const features = AI_FEATURES.map((feature) => ({
    feature,
    label: AI_FEATURE_LABEL[feature],
    customOrder: aiFeatureRoute(feature),
    ...usage.features[feature],
  }));

  return { cards, features };
}

export async function stateResponse() {
  const [{ cards, features }, auditLog] = await Promise.all([
    providerCards(),
    prisma.aiKeyAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  return NextResponse.json({
    success: true,
    data: {
      vaultConfigured: isVaultConfigured(),
      adapters: AI_ADAPTERS.map(describeAdapter),
      providers: cards,
      features,
      auditLog,
    },
  });
}

/** Priority for a new instance: end of the chain. */
export async function nextPriority(): Promise<number> {
  const last = await prisma.aiProviderKey.aggregate({ _max: { priority: true } });
  return (last._max.priority ?? -1) + 1;
}

export function serverError(context: string, message: string, error: unknown) {
  console.error(`${context}:`, error instanceof Error ? error.message : 'unknown');
  return NextResponse.json({ success: false, message }, { status: 500 });
}
