import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/super-admin';
import { storedKeyForTest, testProviderKey } from '@/lib/ai-keys';
import { audit, defaultPriority, forbidden, parseProvider, stateResponse } from '../shared';

/** Test the stored (or .env fallback) key with a minimal real call. Body: { provider }. */
export async function POST(request: NextRequest) {
  const user = await requireSuperAdmin(request);
  if (!user) return forbidden();

  try {
    const body = await request.json().catch(() => null);
    const provider = parseProvider(body?.provider);
    if (!provider) return NextResponse.json({ success: false, message: 'Unknown provider' }, { status: 400 });

    let stored: Awaited<ReturnType<typeof storedKeyForTest>>;
    try {
      stored = await storedKeyForTest(provider);
    } catch {
      return NextResponse.json({ success: false, message: 'Stored key could not be decrypted' }, { status: 500 });
    }
    if (!stored) return NextResponse.json({ success: false, message: 'No key configured for this provider' }, { status: 400 });

    const result = await testProviderKey(provider, stored.key);
    const testedAt = new Date();

    await prisma.aiProviderKey.upsert({
      where: { provider },
      create: {
        provider,
        priority: await defaultPriority(provider),
        lastTestedAt: testedAt,
        lastTestOk: result.ok,
        lastLatencyMs: result.latencyMs,
        lastError: result.error,
        createdBy: user.id,
      },
      update: { lastTestedAt: testedAt, lastTestOk: result.ok, lastLatencyMs: result.latencyMs, lastError: result.error },
    });
    await audit(
      user,
      provider,
      'TEST',
      `${stored.source === 'db' ? 'stored key' : '.env key'}: ${result.ok ? 'ok' : 'failed'} in ${result.latencyMs}ms${result.error ? ` — ${result.error}` : ''}`
    );

    return await stateResponse();
  } catch (error) {
    console.error('AI key test error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ success: false, message: 'Failed to test key' }, { status: 500 });
  }
}
