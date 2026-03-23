import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user || auth.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, message: 'ADMIN only' }, { status: 403 });
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
