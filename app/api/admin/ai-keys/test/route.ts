import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/super-admin';
import { storedKeyForTest } from '@/lib/ai-keys';
import { getAdapter } from '@/lib/ai/providers';
import { audit, badRequest, findInstance, forbidden, optionalText, serverError, stateResponse, validateBaseUrl, validateKey } from '../shared';

/**
 * Two modes:
 * - { id | provider }: test the saved instance (stored key, else .env key);
 *   the result is stored on the card. Returns the full state.
 * - { adapter, key, model?, baseUrl? }: test unsaved values from the
 *   "Add provider" form. Nothing is stored. Returns { ok, latencyMs, error }.
 */
export async function POST(request: NextRequest) {
  const user = await requireSuperAdmin(request);
  if (!user) return forbidden();

  try {
    const body = await request.json().catch(() => null);

    if (body?.adapter !== undefined) {
      const adapter = getAdapter(body.adapter);
      if (!adapter) return badRequest('Unknown adapter');
      const checked = validateKey(body.key);
      if ('error' in checked) return badRequest(checked.error);
      const model = optionalText(body.model, 200);
      if (model === false) return badRequest('Model must be at most 200 characters');
      if (!model && adapter.requiresModel) return badRequest('This provider needs a model');
      let baseUrl: string | null = null;
      if (adapter.requiresBaseUrl) {
        const text = optionalText(body.baseUrl, 300);
        const valid = text ? validateBaseUrl(text) : false;
        if (!valid) return badRequest('Base URL must be an https:// URL');
        baseUrl = valid;
      }
      const result = await adapter.test({ key: checked.key, model: model ?? null, baseUrl });
      return NextResponse.json({ success: true, data: result });
    }

    const instance = await findInstance(body ?? {});
    if (!instance) return badRequest('Unknown provider');
    const adapter = getAdapter(instance.adapter);
    if (!adapter) return badRequest('Unknown adapter');

    let stored: Awaited<ReturnType<typeof storedKeyForTest>>;
    try {
      stored = await storedKeyForTest(instance.id);
    } catch {
      return NextResponse.json({ success: false, message: 'Stored key could not be decrypted' }, { status: 500 });
    }
    if (!stored) return badRequest('No key configured for this provider');

    const result = await adapter.test({ key: stored.key, model: instance.model, baseUrl: instance.baseUrl });
    await prisma.aiProviderKey.update({
      where: { id: instance.id },
      data: { lastTestedAt: new Date(), lastTestOk: result.ok, lastLatencyMs: result.latencyMs, lastError: result.error },
    });
    await audit(
      user,
      instance,
      'TEST',
      `${stored.source === 'db' ? 'stored key' : '.env key'}: ${result.ok ? 'ok' : 'failed'} in ${result.latencyMs}ms${result.error ? ` — ${result.error}` : ''}`
    );

    return await stateResponse();
  } catch (error) {
    return serverError('AI key test error', 'Failed to test key', error);
  }
}
