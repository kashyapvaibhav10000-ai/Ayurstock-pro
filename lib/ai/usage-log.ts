import { AiFeature } from '@prisma/client';
import { prisma } from '@/lib/db';
import { AI_FEATURES } from '@/lib/ai/features';

export interface AiCallEntry {
  requestId: string;
  feature: AiFeature;
  shopId?: string | null;
  instanceId: string | null;
  adapter: string;
  providerName: string;
  model: string | null;
  success: boolean;
  latencyMs: number;
  error?: string | null;
}

/** Record one provider attempt. Never throws: logging must not break parsing. */
export async function logAiCall(entry: AiCallEntry): Promise<void> {
  try {
    await prisma.aiCallLog.create({
      data: { ...entry, shopId: entry.shopId ?? null, error: entry.error ? entry.error.slice(0, 500) : null },
    });
  } catch (error) {
    console.error('AI call log write failed:', error instanceof Error ? error.message : 'unknown error');
  }
}

/** Start of the current UTC day, matching ApiUsageCounter's date key. */
function startOfTodayUtc(): Date {
  return new Date(new Date().toISOString().split('T')[0]);
}

export interface FeatureUsage {
  requestsToday: number;
  requests7d: number;
  /** Requests where some provider succeeded, over the last 7 days (null = no requests). */
  successRate7d: number | null;
  lastServed: { instanceId: string | null; providerName: string; at: Date } | null;
  lastAttempt: { providerName: string; success: boolean; error: string | null; at: Date } | null;
}

export interface InstanceUsage {
  callsToday: Partial<Record<AiFeature, number>>;
  lastError: { feature: AiFeature; error: string | null; at: Date } | null;
}

/** Usage stats for Settings > AI, from AiCallLog. */
export async function aiUsageStats(instanceIds: string[]) {
  const today = startOfTodayUtc();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [todayByInstance, requestRows, lastServed, lastAttempts, lastErrors] = await Promise.all([
    prisma.aiCallLog.groupBy({
      by: ['instanceId', 'feature'],
      where: { createdAt: { gte: today } },
      _count: { _all: true },
    }),
    // One parse request = all attempts sharing a requestId; it succeeded if any attempt did.
    prisma.$queryRaw<Array<{ feature: AiFeature; requests7d: number; succeeded7d: number; requestsToday: number }>>`
      SELECT "feature",
             COUNT(*)::int AS "requests7d",
             COUNT(*) FILTER (WHERE "ok")::int AS "succeeded7d",
             COUNT(*) FILTER (WHERE "started" >= ${today})::int AS "requestsToday"
      FROM (
        SELECT "feature", "requestId", bool_or("success") AS "ok", MIN("createdAt") AS "started"
        FROM "AiCallLog"
        WHERE "createdAt" >= ${weekAgo}
        GROUP BY "feature", "requestId"
      ) AS requests
      GROUP BY "feature"`,
    Promise.all(
      AI_FEATURES.map((feature) =>
        prisma.aiCallLog.findFirst({
          where: { feature, success: true },
          orderBy: { createdAt: 'desc' },
          select: { instanceId: true, providerName: true, createdAt: true },
        })
      )
    ),
    Promise.all(
      AI_FEATURES.map((feature) =>
        prisma.aiCallLog.findFirst({
          where: { feature },
          orderBy: { createdAt: 'desc' },
          select: { providerName: true, success: true, error: true, createdAt: true },
        })
      )
    ),
    Promise.all(
      instanceIds.map((instanceId) =>
        prisma.aiCallLog.findFirst({
          where: { instanceId, success: false },
          orderBy: { createdAt: 'desc' },
          select: { feature: true, error: true, createdAt: true },
        })
      )
    ),
  ]);

  const features = {} as Record<AiFeature, FeatureUsage>;
  AI_FEATURES.forEach((feature, index) => {
    const row = requestRows.find((r) => r.feature === feature);
    const served = lastServed[index];
    const attempt = lastAttempts[index];
    features[feature] = {
      requestsToday: row?.requestsToday ?? 0,
      requests7d: row?.requests7d ?? 0,
      successRate7d: row && row.requests7d > 0 ? row.succeeded7d / row.requests7d : null,
      lastServed: served ? { instanceId: served.instanceId, providerName: served.providerName, at: served.createdAt } : null,
      lastAttempt: attempt
        ? { providerName: attempt.providerName, success: attempt.success, error: attempt.error, at: attempt.createdAt }
        : null,
    };
  });

  const instances: Record<string, InstanceUsage> = {};
  instanceIds.forEach((id, index) => {
    const callsToday: InstanceUsage['callsToday'] = {};
    for (const row of todayByInstance) {
      if (row.instanceId === id) callsToday[row.feature] = row._count._all;
    }
    const error = lastErrors[index];
    instances[id] = { callsToday, lastError: error ? { feature: error.feature, error: error.error, at: error.createdAt } : null };
  });

  return { features, instances };
}
