import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/super-admin';
import { invalidateAiKeyCache, instanceName } from '@/lib/ai-keys';
import { audit, badRequest, forbidden, parseProvider, serverError, stateResponse } from '../shared';

/**
 * Set the global fallback chain. Body: { order: [instanceId, ...] } listing
 * every instance once. Legacy provider names (GEMINI, ...) are accepted too.
 */
export async function PUT(request: NextRequest) {
  const user = await requireSuperAdmin(request);
  if (!user) return forbidden();

  try {
    const body = await request.json().catch(() => null);
    const rows = await prisma.aiProviderKey.findMany({ select: { id: true, provider: true, adapter: true, displayName: true } });
    const byProvider = new Map(rows.filter((row) => row.provider).map((row) => [row.provider, row.id]));
    const ids: string[] = Array.isArray(body?.order)
      ? body.order.map((value: unknown) => {
          const provider = parseProvider(value);
          return provider ? byProvider.get(provider) : value;
        })
      : [];
    const known = new Set(rows.map((row) => row.id));
    const valid = ids.length === rows.length && ids.every((id) => known.has(id)) && new Set(ids).size === rows.length;
    if (!valid) return badRequest('order must list every provider once');

    await prisma.$transaction(ids.map((id, priority) => prisma.aiProviderKey.update({ where: { id }, data: { priority } })));
    invalidateAiKeyCache();
    const byId = new Map(rows.map((row) => [row.id, row]));
    await audit(user, byId.get(ids[0]) ?? null, 'REORDER', ids.map((id) => instanceName(byId.get(id)!)).join(' > '));

    return await stateResponse();
  } catch (error) {
    return serverError('AI key reorder error', 'Failed to save order', error);
  }
}
