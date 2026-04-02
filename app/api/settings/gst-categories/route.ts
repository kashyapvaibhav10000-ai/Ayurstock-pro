import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createErrorResponse } from '@/middleware/auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return createErrorResponse('Unauthorized', 401);

    const shopId = auth.user.shopId;

    const mappings = await prisma.gstCategoryDefault.findMany({
      where: { shopId },
      orderBy: { category: 'asc' },
    });

    return NextResponse.json({ success: true, data: mappings });
  } catch (error: any) {
    console.error('GST categories GET error:', error);
    return createErrorResponse(error.message || 'Failed to fetch GST categories', 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || auth.user.role !== 'ADMIN') {
      return createErrorResponse('Unauthorized, Admin access required', 401);
    }

    const shopId = auth.user.shopId;
    const body = await request.json();
    const { categories } = body; // Array of { category: string, gstPercent: number }

    if (!Array.isArray(categories)) {
      return NextResponse.json({ success: false, error: 'categories must be an array' }, { status: 400 });
    }

    const results = [];

    for (const item of categories) {
      if (!item.category || typeof item.gstPercent !== 'number') continue;

      const result = await prisma.gstCategoryDefault.upsert({
        where: {
          shopId_category: { shopId, category: item.category },
        },
        update: { gstPercent: item.gstPercent },
        create: { shopId, category: item.category, gstPercent: item.gstPercent },
      });
      results.push(result);
    }

    return NextResponse.json({ success: true, data: results, message: `${results.length} GST category defaults saved.` });
  } catch (error: any) {
    console.error('GST categories PUT error:', error);
    return createErrorResponse(error.message || 'Failed to update GST categories', 500);
  }
}
