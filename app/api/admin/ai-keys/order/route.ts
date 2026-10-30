import { NextRequest, NextResponse } from 'next/server';
import { AiProvider } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/super-admin';
import { AI_PROVIDERS, invalidateAiKeyCache } from '@/lib/ai-keys';
import { audit, forbidden, parseProvider, stateResponse } from '../shared';

/** Set the fallback chain order. Body: { order: ['GROQ', 'GEMINI', ...] } (all providers). */
export async function PUT(request: NextRequest) {
  const user = await requireSuperAdmin(request);
  if (!user) return forbidden();

  try {
    const body = await request.json().catch(() => null);
    const order = Array.isArray(body?.order) ? body.order.map(parseProvider) : [];
    const valid =
      order.length === AI_PROVIDERS.length &&
      order.every(Boolean) &&
      new Set(order).size === AI_PROVIDERS.length;
    if (!valid) {
      return NextResponse.json({ success: false, message: 'order must list every provider once' }, { status: 400 });
    }

    await prisma.$transaction(
      (order as AiProvider[]).map((provider, priority) =>
        prisma.aiProviderKey.upsert({
          where: { provider },
          create: { provider, priority, createdBy: user.id },
          update: { priority },
        })
      )
    );
    invalidateAiKeyCache();
    await audit(user, order[0] as AiProvider, 'REORDER', (order as AiProvider[]).join(' > '));

    return await stateResponse();
  } catch (error) {
    console.error('AI key reorder error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ success: false, message: 'Failed to save order' }, { status: 500 });
  }
}
