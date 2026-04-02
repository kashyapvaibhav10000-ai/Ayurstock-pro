import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createErrorResponse, createApiResponse } from '@/middleware/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query') || '';

    const sales = await prisma.sale.findMany({
      where: {
        shopId: auth.user.shopId,
        OR: [
          { invoiceNumber: { contains: query, mode: 'insensitive' } },
          { customer: { name: { contains: query, mode: 'insensitive' } } }
        ]
      },
      include: {
        customer: {
          select: { name: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    return createApiResponse(true, sales);
  } catch (error: any) {
    console.error('Sales Search Error:', error);
    return createErrorResponse(error.message, 500);
  }
}
