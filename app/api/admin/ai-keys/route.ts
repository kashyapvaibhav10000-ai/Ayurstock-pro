import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/super-admin';
import { encryptKey, invalidateAiKeyCache, isVaultConfigured, keyAad } from '@/lib/ai-keys';
import { getAdapter } from '@/lib/ai/providers';
import {
  audit,
  badRequest,
  findInstance,
  forbidden,
  optionalText,
  serverError,
  stateResponse,
  validateBaseUrl,
  validateKey,
} from './shared';

// Super-admin only. Keys are write-only: responses carry last4 + status.
// Instances are addressed by { id }; { provider } still works for the four
// original providers.

export async function GET(request: NextRequest) {
  const user = await requireSuperAdmin(request);
  if (!user) return forbidden();
  try {
    return await stateResponse();
  } catch (error) {
    return serverError('AI keys load error', 'Failed to load AI settings', error);
  }
}

/** Add or replace an instance's key. Body: { id | provider, key }. */
export async function POST(request: NextRequest) {
  const user = await requireSuperAdmin(request);
  if (!user) return forbidden();

  try {
    const body = await request.json().catch(() => null);
    const instance = await findInstance(body ?? {});
    if (!instance) return badRequest('Unknown provider');
    const checked = validateKey(body?.key);
    if ('error' in checked) return badRequest(checked.error);
    if (!isVaultConfigured()) {
      return NextResponse.json(
        { success: false, message: 'AI_ENCRYPTION_KEY is not configured on the server' },
        { status: 503 }
      );
    }

    const encrypted = encryptKey(keyAad(instance), checked.key);
    await prisma.aiProviderKey.update({
      where: { id: instance.id },
      // A new key invalidates the previous test result.
      data: { ...encrypted, createdBy: user.id, lastTestedAt: null, lastTestOk: null, lastLatencyMs: null, lastError: null },
    });
    invalidateAiKeyCache();
    await audit(user, instance, instance.encryptedKey ? 'REPLACE' : 'ADD', `••••${encrypted.last4}`);

    return await stateResponse();
  } catch (error) {
    return serverError('AI key save error', 'Failed to save key', error);
  }
}

/**
 * Update an instance. Body: { id | provider, enabled?, displayName?, model?, baseUrl? }.
 * model / baseUrl null = back to the adapter default.
 */
export async function PATCH(request: NextRequest) {
  const user = await requireSuperAdmin(request);
  if (!user) return forbidden();

  try {
    const body = await request.json().catch(() => null);
    const instance = await findInstance(body ?? {});
    if (!instance) return badRequest('Unknown provider');
    const adapter = getAdapter(instance.adapter);
    if (!adapter) return badRequest('Unknown adapter');

    const data: { enabled?: boolean; displayName?: string | null; model?: string | null; baseUrl?: string | null } = {};
    const changes: string[] = [];

    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') return badRequest('enabled must be true or false');
      data.enabled = body.enabled;
    }
    const displayName = optionalText(body.displayName, 60);
    if (displayName === false) return badRequest('Name must be at most 60 characters');
    if (displayName !== undefined) {
      data.displayName = displayName;
      changes.push(`name: ${displayName ?? adapter.name}`);
    }
    const model = optionalText(body.model, 200);
    if (model === false) return badRequest('Model must be at most 200 characters');
    if (model !== undefined) {
      if (!model && adapter.requiresModel) return badRequest('This provider needs a model');
      data.model = model;
      changes.push(`model: ${model ?? `default (${adapter.defaultModel})`}`);
    }
    const baseUrlText = optionalText(body.baseUrl, 300);
    if (baseUrlText === false) return badRequest('Base URL is too long');
    if (baseUrlText !== undefined) {
      if (!adapter.requiresBaseUrl) return badRequest('This provider has a fixed URL');
      const baseUrl = await validateBaseUrl(baseUrlText);
      if (!baseUrl) return badRequest('Base URL must be a public https:// URL');
      data.baseUrl = baseUrl;
      changes.push(`base URL: ${baseUrl}`);
    }
    if (Object.keys(data).length === 0) return badRequest('Nothing to update');

    // A different model or endpoint invalidates the previous test result.
    const retest = data.model !== undefined || data.baseUrl !== undefined;
    await prisma.aiProviderKey.update({
      where: { id: instance.id },
      data: { ...data, ...(retest ? { lastTestedAt: null, lastTestOk: null, lastLatencyMs: null, lastError: null } : {}) },
    });
    invalidateAiKeyCache();
    if (data.enabled !== undefined) await audit(user, instance, data.enabled ? 'ENABLE' : 'DISABLE');
    if (changes.length) await audit(user, { ...instance, ...data }, 'UPDATE', changes.join(', '));

    return await stateResponse();
  } catch (error) {
    return serverError('AI provider update error', 'Failed to update provider', error);
  }
}

/**
 * Revoke (delete) the stored key. ?id=… (or ?provider=GEMINI). The instance,
 * its priority and enabled flag stay; an original provider then falls back
 * to its .env key, any other instance is skipped until a key is added.
 */
export async function DELETE(request: NextRequest) {
  const user = await requireSuperAdmin(request);
  if (!user) return forbidden();

  try {
    const params = request.nextUrl.searchParams;
    const instance = await findInstance({ id: params.get('id'), provider: params.get('provider') });
    if (!instance) return badRequest('Unknown provider');

    if (instance.encryptedKey) {
      await prisma.aiProviderKey.update({
        where: { id: instance.id },
        data: {
          encryptedKey: null,
          iv: null,
          authTag: null,
          last4: null,
          lastTestedAt: null,
          lastTestOk: null,
          lastLatencyMs: null,
          lastError: null,
        },
      });
      invalidateAiKeyCache();
      await audit(user, instance, 'REVOKE', instance.last4 ? `••••${instance.last4}` : null);
    }

    return await stateResponse();
  } catch (error) {
    return serverError('AI key revoke error', 'Failed to revoke key', error);
  }
}
