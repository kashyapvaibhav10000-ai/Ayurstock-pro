import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/super-admin';
import { invalidateAiKeyCache, instanceName } from '@/lib/ai-keys';
import { AI_FEATURE_LABEL, parseFeature } from '@/lib/ai/features';
import { audit, badRequest, forbidden, serverError, stateResponse } from '../shared';

/**
 * Per-feature provider order. Body: { feature, order: [instanceId, ...] | null }.
 * null (or an empty list) = use the global chain again.
 */
export async function PUT(request: NextRequest) {
  const user = await requireSuperAdmin(request);
  if (!user) return forbidden();

  try {
    const body = await request.json().catch(() => null);
    const feature = parseFeature(body?.feature);
    if (!feature) return badRequest('Unknown feature');

    const order: unknown = body.order;
    if (order === null || (Array.isArray(order) && order.length === 0)) {
      await prisma.aiFeatureRoute.deleteMany({ where: { feature } });
      invalidateAiKeyCache();
      await audit(user, null, 'ROUTE', `${AI_FEATURE_LABEL[feature]}: global chain`);
      return await stateResponse();
    }

    if (!Array.isArray(order) || !order.every((id) => typeof id === 'string') || new Set(order).size !== order.length) {
      return badRequest('order must be a list of distinct provider ids');
    }
    const rows = await prisma.aiProviderKey.findMany({
      where: { id: { in: order as string[] } },
      select: { id: true, adapter: true, displayName: true },
    });
    if (rows.length !== order.length) return badRequest('order contains an unknown provider');

    await prisma.aiFeatureRoute.upsert({
      where: { feature },
      create: { feature, instanceIds: order as string[], updatedBy: user.id },
      update: { instanceIds: order as string[], updatedBy: user.id },
    });
    invalidateAiKeyCache();
    const byId = new Map(rows.map((row) => [row.id, row]));
    await audit(
      user,
      null,
      'ROUTE',
      `${AI_FEATURE_LABEL[feature]}: ${(order as string[]).map((id) => instanceName(byId.get(id)!)).join(' > ')}`
    );

    return await stateResponse();
  } catch (error) {
    return serverError('AI feature route error', 'Failed to save feature order', error);
  }
}
