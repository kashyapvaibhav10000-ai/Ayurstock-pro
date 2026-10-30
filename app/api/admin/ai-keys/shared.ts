import { AiProvider } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { AI_PROVIDERS, aiKeySource, aiProviderOrder, envKey, isVaultConfigured, loadAiKeys } from '@/lib/ai-keys';
import { AuthUser } from '@/types';

export function forbidden() {
  // 404 rather than 403 so the endpoint is not advertised to non-super-admins.
  return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
}

export function parseProvider(value: unknown): AiProvider | null {
  return typeof value === 'string' && (AI_PROVIDERS as string[]).includes(value) ? (value as AiProvider) : null;
}

export async function audit(user: AuthUser, provider: AiProvider, action: string, detail?: string | null) {
  await prisma.aiKeyAuditLog.create({
    data: { provider, action, detail: detail ?? null, userId: user.id, userEmail: user.email },
  });
}

/** Card state for every provider. Only metadata — never key material. */
export async function providerCards() {
  await loadAiKeys();
  const rows = await prisma.aiProviderKey.findMany({
    select: {
      provider: true,
      last4: true,
      encryptedKey: true,
      enabled: true,
      lastTestedAt: true,
      lastTestOk: true,
      lastLatencyMs: true,
      lastError: true,
      updatedAt: true,
    },
  });
  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  return aiProviderOrder().map((provider, index) => {
    const row = byProvider.get(provider);
    return {
      provider,
      priority: index,
      hasDbKey: Boolean(row?.encryptedKey),
      last4: row?.encryptedKey ? row.last4 : null,
      enabled: row?.enabled ?? true,
      envKeyPresent: Boolean(envKey(provider)),
      activeSource: aiKeySource(provider),
      lastTestedAt: row?.lastTestedAt ?? null,
      lastTestOk: row?.lastTestOk ?? null,
      lastLatencyMs: row?.lastLatencyMs ?? null,
      lastError: row?.lastError ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

export async function stateResponse() {
  const [cards, auditLog] = await Promise.all([
    providerCards(),
    prisma.aiKeyAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  return NextResponse.json({
    success: true,
    data: { vaultConfigured: isVaultConfigured(), providers: cards, auditLog },
  });
}

/** Priority for a provider getting its first row: its current chain slot. */
export async function defaultPriority(provider: AiProvider): Promise<number> {
  await loadAiKeys();
  return aiProviderOrder().indexOf(provider);
}
