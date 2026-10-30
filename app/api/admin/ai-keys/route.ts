import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/super-admin';
import { encryptKey, invalidateAiKeyCache, isVaultConfigured } from '@/lib/ai-keys';
import { audit, defaultPriority, forbidden, parseProvider, stateResponse } from './shared';

// Super-admin only. Keys are write-only: responses carry last4 + status.

export async function GET(request: NextRequest) {
  const user = await requireSuperAdmin(request);
  if (!user) return forbidden();
  try {
    return await stateResponse();
  } catch (error) {
    console.error('AI keys load error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ success: false, message: 'Failed to load AI settings' }, { status: 500 });
  }
}

/** Add or replace a provider key. Body: { provider, key }. */
export async function POST(request: NextRequest) {
  const user = await requireSuperAdmin(request);
  if (!user) return forbidden();

  try {
    const body = await request.json().catch(() => null);
    const provider = parseProvider(body?.provider);
    const key = typeof body?.key === 'string' ? body.key.trim() : '';
    if (!provider) return NextResponse.json({ success: false, message: 'Unknown provider' }, { status: 400 });
    if (key.length < 8 || key.length > 512 || /\s/.test(key)) {
      return NextResponse.json({ success: false, message: 'Key looks invalid (8-512 characters, no spaces)' }, { status: 400 });
    }
    if (!isVaultConfigured()) {
      return NextResponse.json(
        { success: false, message: 'AI_ENCRYPTION_KEY is not configured on the server' },
        { status: 503 }
      );
    }

    const encrypted = encryptKey(provider, key);
    const existing = await prisma.aiProviderKey.findUnique({ where: { provider }, select: { encryptedKey: true } });
    const priority = await defaultPriority(provider);

    await prisma.aiProviderKey.upsert({
      where: { provider },
      create: { provider, ...encrypted, enabled: true, priority, createdBy: user.id },
      // A new key invalidates the previous test result.
      update: { ...encrypted, createdBy: user.id, lastTestedAt: null, lastTestOk: null, lastLatencyMs: null, lastError: null },
    });
    invalidateAiKeyCache();
    await audit(user, provider, existing?.encryptedKey ? 'REPLACE' : 'ADD', `••••${encrypted.last4}`);

    return await stateResponse();
  } catch (error) {
    console.error('AI key save error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ success: false, message: 'Failed to save key' }, { status: 500 });
  }
}

/** Enable / disable a provider. Body: { provider, enabled }. */
export async function PATCH(request: NextRequest) {
  const user = await requireSuperAdmin(request);
  if (!user) return forbidden();

  try {
    const body = await request.json().catch(() => null);
    const provider = parseProvider(body?.provider);
    if (!provider || typeof body?.enabled !== 'boolean') {
      return NextResponse.json({ success: false, message: 'provider and enabled are required' }, { status: 400 });
    }

    await prisma.aiProviderKey.upsert({
      where: { provider },
      create: { provider, enabled: body.enabled, priority: await defaultPriority(provider), createdBy: user.id },
      update: { enabled: body.enabled },
    });
    invalidateAiKeyCache();
    await audit(user, provider, body.enabled ? 'ENABLE' : 'DISABLE');

    return await stateResponse();
  } catch (error) {
    console.error('AI key toggle error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ success: false, message: 'Failed to update provider' }, { status: 500 });
  }
}

/** Revoke (delete) the stored key. ?provider=GEMINI. Priority/enabled kept. */
export async function DELETE(request: NextRequest) {
  const user = await requireSuperAdmin(request);
  if (!user) return forbidden();

  try {
    const provider = parseProvider(request.nextUrl.searchParams.get('provider'));
    if (!provider) return NextResponse.json({ success: false, message: 'Unknown provider' }, { status: 400 });

    const existing = await prisma.aiProviderKey.findUnique({ where: { provider }, select: { last4: true, encryptedKey: true } });
    if (existing?.encryptedKey) {
      await prisma.aiProviderKey.update({
        where: { provider },
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
      await audit(user, provider, 'REVOKE', existing.last4 ? `••••${existing.last4}` : null);
    }

    return await stateResponse();
  } catch (error) {
    console.error('AI key revoke error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ success: false, message: 'Failed to revoke key' }, { status: 500 });
  }
}
