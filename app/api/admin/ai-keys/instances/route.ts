import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/super-admin';
import { encryptKey, invalidateAiKeyCache, isVaultConfigured, keyAad } from '@/lib/ai-keys';
import { getAdapter } from '@/lib/ai/providers';
import {
  audit,
  badRequest,
  forbidden,
  nextPriority,
  optionalText,
  serverError,
  stateResponse,
  validateBaseUrl,
  validateKey,
} from '../shared';

/**
 * Add a provider instance. Body: { adapter, displayName?, model?, baseUrl?, key }.
 * The key is tested first; nothing is saved unless the test passes.
 */
export async function POST(request: NextRequest) {
  const user = await requireSuperAdmin(request);
  if (!user) return forbidden();

  try {
    const body = await request.json().catch(() => null);
    const adapter = getAdapter(body?.adapter);
    if (!adapter) return badRequest('Unknown adapter');

    const displayName = optionalText(body.displayName, 60);
    if (displayName === false) return badRequest('Name must be at most 60 characters');
    const model = optionalText(body.model, 200);
    if (model === false) return badRequest('Model must be at most 200 characters');
    if (!model && adapter.requiresModel) return badRequest('This provider needs a model');
    const baseUrlText = optionalText(body.baseUrl, 300);
    if (baseUrlText === false) return badRequest('Base URL is too long');
    let baseUrl: string | null = null;
    if (adapter.requiresBaseUrl) {
      const valid = validateBaseUrl(baseUrlText ?? null);
      if (!valid) return badRequest('Base URL must be an https:// URL');
      baseUrl = valid;
    }
    const checked = validateKey(body.key);
    if ('error' in checked) return badRequest(checked.error);
    if (!isVaultConfigured()) {
      return NextResponse.json(
        { success: false, message: 'AI_ENCRYPTION_KEY is not configured on the server' },
        { status: 503 }
      );
    }

    const config = { key: checked.key, model: model ?? null, baseUrl };
    const result = await adapter.test(config);
    if (!result.ok) return badRequest(`Test failed: ${result.error ?? 'unknown error'}`);

    // The first instance of an original provider takes over its slot (and
    // with it the .env fallback); further instances are independent.
    const slotTaken = adapter.legacyProvider
      ? await prisma.aiProviderKey.findUnique({ where: { provider: adapter.legacyProvider }, select: { id: true } })
      : null;
    const provider = adapter.legacyProvider && !slotTaken ? adapter.legacyProvider : null;
    const id = randomUUID();

    const created = await prisma.aiProviderKey.create({
      data: {
        id,
        provider,
        adapter: adapter.id,
        displayName: displayName ?? null,
        model: model ?? null,
        baseUrl,
        ...encryptKey(keyAad({ id, provider }), checked.key),
        enabled: true,
        priority: await nextPriority(),
        lastTestedAt: new Date(),
        lastTestOk: true,
        lastLatencyMs: result.latencyMs,
        createdBy: user.id,
      },
    });
    invalidateAiKeyCache();
    await audit(
      user,
      created,
      'CREATE',
      [adapter.name, model ? `model ${model}` : null, baseUrl, `••••${created.last4}`].filter(Boolean).join(' · ')
    );

    return await stateResponse();
  } catch (error) {
    return serverError('AI provider create error', 'Failed to add provider', error);
  }
}

/** Permanently delete an instance and its key. ?id=… Also drops it from feature orders. */
export async function DELETE(request: NextRequest) {
  const user = await requireSuperAdmin(request);
  if (!user) return forbidden();

  try {
    const id = request.nextUrl.searchParams.get('id');
    const instance = id ? await prisma.aiProviderKey.findUnique({ where: { id } }) : null;
    if (!instance) return badRequest('Unknown provider');

    const routes = await prisma.aiFeatureRoute.findMany({ where: { instanceIds: { has: instance.id } } });
    await prisma.$transaction([
      prisma.aiProviderKey.delete({ where: { id: instance.id } }),
      ...routes.map((route) => {
        const instanceIds = route.instanceIds.filter((routeId) => routeId !== instance.id);
        // A feature left with no providers goes back to the global chain.
        return instanceIds.length
          ? prisma.aiFeatureRoute.update({ where: { feature: route.feature }, data: { instanceIds, updatedBy: user.id } })
          : prisma.aiFeatureRoute.delete({ where: { feature: route.feature } });
      }),
    ]);
    invalidateAiKeyCache();
    await audit(
      user,
      instance,
      'REMOVE',
      [instance.last4 ? `••••${instance.last4}` : 'no stored key', routes.length ? `removed from ${routes.length} feature order(s)` : null]
        .filter(Boolean)
        .join(' · ')
    );

    return await stateResponse();
  } catch (error) {
    return serverError('AI provider remove error', 'Failed to remove provider', error);
  }
}
