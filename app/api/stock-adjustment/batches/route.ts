import { NextRequest } from 'next/server';
import { authenticateRequest, createErrorResponse, createApiResponse } from '@/middleware/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return createErrorResponse('Forbidden - Insufficient permissions', 403);
    }

    const query = (request.nextUrl.searchParams.get('q') || '').trim();
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '15', 10), 30);

    if (query.length < 2) {
      return createApiResponse(true, []);
    }

    const batches = await prisma.inventoryBatch.findMany({
      where: {
        shopId: auth.user.shopId,
        OR: [
          {
            medicine: {
              name: { contains: query, mode: 'insensitive' },
            },
          },
          {
            batchNumber: { contains: query, mode: 'insensitive' },
          },
        ],
      },
      include: {
        medicine: {
          select: {
            id: true,
            name: true,
            company: true,
          },
        },
      },
      orderBy: [{ medicine: { name: 'asc' } }, { batchNumber: 'asc' }],
      take: limit,
    });

    const results = batches.map((batch) => ({
      batchId: batch.id,
      medicineId: batch.medicine.id,
      medicineName: batch.medicine.name,
      company: batch.medicine.company,
      batchNumber: batch.batchNumber,
      currentStock: batch.stockQty,
      expiryDate: batch.expiryDate,
      mrp: Number(batch.mrp),
    }));

    return createApiResponse(true, results);
  } catch (error) {
    console.error('Stock adjustment batch search error:', error);
    return createErrorResponse('Failed to search batches', 500);
  }
}
