import { NextRequest } from 'next/server';
import { authenticateRequest, createErrorResponse, createApiResponse } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const CreateStockAdjustmentSchema = z.object({
  batchId: z.string().min(1, 'Batch is required'),
  type: z.enum(['ADD', 'REMOVE']),
  quantity: z.number().int().positive('Quantity must be at least 1'),
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return createErrorResponse('Forbidden - Insufficient permissions', 403);
    }

    const body = await request.json();
    const validation = CreateStockAdjustmentSchema.safeParse(body);
    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      return createErrorResponse(`Validation error: ${JSON.stringify(errors)}`, 400);
    }

    const { batchId, type, quantity, reason, notes } = validation.data;

    const result = await prisma.$transaction(async (tx) => {
      // Get the batch with medicine info
      const batch = await tx.inventoryBatch.findFirst({
        where: {
          id: batchId,
          shopId: auth.user.shopId,
        },
        include: {
          medicine: {
            select: { id: true, name: true },
          },
        },
      });

      if (!batch) {
        throw new Error('Batch not found');
      }

      const stockBefore = batch.stockQty;

      // Validate removal won't go negative
      if (type === 'REMOVE' && quantity > stockBefore) {
        throw new Error(`Cannot remove ${quantity} units. Current stock is ${stockBefore}.`);
      }

      const stockAfter = type === 'ADD' ? stockBefore + quantity : stockBefore - quantity;

      // Update batch stock
      await tx.inventoryBatch.update({
        where: { id: batchId },
        data: { stockQty: stockAfter },
      });

      // Create StockAdjustment record
      const adjustment = await tx.stockAdjustment.create({
        data: {
          shopId: auth.user.shopId,
          medicineId: batch.medicine.id,
          batchId: batchId,
          userId: auth.user.id,
          type,
          quantity,
          stockBefore,
          stockAfter,
          reason,
          notes: notes || null,
        },
      });

      // Create StockLedger entry
      await tx.stockLedger.create({
        data: {
          shopId: auth.user.shopId,
          medicineId: batch.medicine.id,
          batchId: batchId,
          type: type === 'ADD' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
          qty: quantity,
          referenceId: adjustment.id,
        },
      });

      // Log activity
      await tx.activityLog.create({
        data: {
          shopId: auth.user.shopId,
          userId: auth.user.id,
          action: 'STOCK_ADJUSTMENT',
          meta: JSON.stringify({
            adjustmentId: adjustment.id,
            medicineName: batch.medicine.name,
            batchNumber: batch.batchNumber,
            type,
            quantity,
            stockBefore,
            stockAfter,
            reason,
          }),
        },
      });

      return adjustment;
    });

    return createApiResponse(true, result, undefined, 201);
  } catch (error) {
    console.error('Stock adjustment error:', error);
    if (error instanceof Error && (error.message.includes('Cannot remove') || error.message.includes('Batch not found'))) {
      return createErrorResponse(error.message, 400);
    }
    return createErrorResponse('Internal server error', 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return createErrorResponse('Forbidden - Insufficient permissions', 403);
    }

    const searchParams = request.nextUrl.searchParams;
    const typeFilter = searchParams.get('type'); // 'ADD' | 'REMOVE' | null (all)
    const search = (searchParams.get('search') || '').trim();
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const where: any = {
      shopId: auth.user.shopId,
    };

    if (typeFilter === 'ADD' || typeFilter === 'REMOVE') {
      where.type = typeFilter;
    }

    // If search is provided, we need to find matching medicine IDs first
    let medicineIds: string[] | undefined;
    if (search) {
      const matchingMedicines = await prisma.medicine.findMany({
        where: {
          shopId: auth.user.shopId,
          name: { contains: search, mode: 'insensitive' },
        },
        select: { id: true },
        take: 50,
      });
      medicineIds = matchingMedicines.map((m) => m.id);
      where.medicineId = { in: medicineIds };
    }

    const [adjustments, total] = await Promise.all([
      prisma.stockAdjustment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.stockAdjustment.count({ where }),
    ]);

    // Fetch medicine names for the results
    const uniqueMedicineIds = Array.from(new Set(adjustments.map((a: any) => a.medicineId))) as string[];
    const medicines = await prisma.medicine.findMany({
      where: { id: { in: uniqueMedicineIds } },
      select: { id: true, name: true },
    });
    const medicineMap = new Map(medicines.map((m) => [m.id, m.name]));

    const enriched = adjustments.map((a: any) => ({
      ...a,
      medicineName: medicineMap.get(a.medicineId) || 'Unknown',
    }));

    return createApiResponse(true, { adjustments: enriched, total, limit, offset });
  } catch (error) {
    console.error('Get stock adjustments error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
