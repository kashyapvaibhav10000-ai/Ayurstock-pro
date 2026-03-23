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
    const skip = (page - 1) * limit;

    const [history, total] = await Promise.all([
      prisma.loginHistory.findMany({
        where: {
          user: {
            shopId: auth.user.shopId
          }
        },
        include: {
          user: {
            select: { name: true, email: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.loginHistory.count({
        where: {
          user: {
            shopId: auth.user.shopId
          }
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      data: history,
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
