import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user || auth.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, message: 'ADMIN only' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const statusFilter = searchParams.get('status'); // 'failed' or null
    const skip = (page - 1) * limit;

    // Own users' attempts plus this shop's POS failures (no user). Attempts
    // for unknown usernames/emails belong to no shop and are not shown here.
    const shopScope = { OR: [{ user: { shopId: auth.user.shopId } }, { shopId: auth.user.shopId }] };
    const whereClause: any = { ...shopScope };
    if (statusFilter === 'failed') {
      whereClause.status = 'failed';
    }

    const [history, total] = await Promise.all([
      prisma.loginHistory.findMany({
        where: whereClause,
        include: {
          user: {
            select: { name: true, email: true, username: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.loginHistory.count({ where: whereClause }),
    ]);

    // Aggregate failed login counts per IP
    const failedByIp = await prisma.loginHistory.groupBy({
      by: ['ipAddress'],
      where: {
        ...shopScope,
        status: 'failed',
        ipAddress: { not: null },
      },
      _count: { id: true },
    });

    const failedIpCounts: Record<string, number> = {};
    for (const row of failedByIp) {
      if (row.ipAddress) {
        failedIpCounts[row.ipAddress] = row._count.id;
      }
    }

    return NextResponse.json({
      success: true,
      data: history,
      failedIpCounts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Login history error:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch login history' }, { status: 500 });
  }
}
