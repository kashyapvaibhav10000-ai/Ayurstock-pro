import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createErrorResponse, createApiResponse } from '@/middleware/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    const { id } = await params;

    const sale = await prisma.sale.findUnique({
      where: { id, shopId: auth.user.shopId },
      include: {
        saleItems: {
          include: {
            medicine: {
              select: { name: true, company: true }
            },
            batch: {
              select: { batchNumber: true, expiryDate: true }
            }
          }
        }
      }
    });

    if (!sale) {
      return createErrorResponse('Sale not found', 404);
    }

    return createApiResponse(true, sale.saleItems);
  } catch (error: any) {
    console.error('Sale Items Fetch Error:', error);
    return createErrorResponse(error.message, 500);
  }
}
