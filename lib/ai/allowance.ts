import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { AuthUser } from '@/types';

const DEFAULT_DAILY_CALLS_PER_SHOP = 200;

function dailyCap(): number {
  const value = parseInt(process.env.AI_DAILY_CALLS_PER_SHOP || '', 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_DAILY_CALLS_PER_SHOP;
}

/**
 * Gate for every route that spends AI provider calls. Provider quotas are
 * shared by all shops, so one shop must not be able to drain them:
 * ADMIN/MANAGER only, a per-user burst limit, and a per-shop daily cap on
 * provider calls (AiCallLog rows, AI_DAILY_CALLS_PER_SHOP, default 200).
 * Returns the error response to send, or null when the call may proceed.
 */
export async function aiAllowanceError(user: AuthUser): Promise<NextResponse | null> {
  if (!['ADMIN', 'MANAGER'].includes(user.role)) {
    return NextResponse.json({ success: false, message: 'Forbidden - Insufficient permissions' }, { status: 403 });
  }

  const burst = rateLimit(`ai:${user.id}`, 10, 10 * 60_000);
  if (!burst.allowed) {
    return NextResponse.json(
      { success: false, message: `Too many AI imports. Try again in ${burst.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  const startOfDay = new Date(new Date().toISOString().split('T')[0]);
  const used = await prisma.aiCallLog.count({ where: { shopId: user.shopId, createdAt: { gte: startOfDay } } });
  if (used >= dailyCap()) {
    return NextResponse.json(
      { success: false, message: 'Daily AI limit for this shop reached. Try again tomorrow.', errorCode: 'SHOP_AI_CAP' },
      { status: 429 }
    );
  }

  return null;
}
