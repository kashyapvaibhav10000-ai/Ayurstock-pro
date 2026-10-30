import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/super-admin';

export async function GET(req: NextRequest) {
  try {
    // Part of Settings > AI, which is super-admin only.
    const user = await requireSuperAdmin(req);
    if (!user) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }

    const usage = await prisma.apiUsageCounter.findMany({
      orderBy: { date: 'desc' },
      take: 30, // Last 30 days
    });

    return NextResponse.json({
      success: true,
      data: usage
    });

  } catch (error) {
    console.error('AI usage error:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch AI usage stats' }, { status: 500 });
  }
}
