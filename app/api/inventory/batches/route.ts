import { NextRequest } from 'next/server';
import { authenticateRequest, createApiResponse, createErrorResponse, createPaginatedResponse } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import { getAvailableBatches, getLowStockMedicines, getNearExpiryMedicines } from '@/services/inventory';
import { CreateBatchSchema } from '@/lib/schemas';

export async function GET(request: NextRequest) {
  try {
    // Authenticate
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    const searchParams = request.nextUrl.searchParams;
    const medicineId = searchParams.get('medicineId');
    const reportType = searchParams.get('report'); // 'low-stock', 'near-expiry'
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 5000);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Low stock report
    if (reportType === 'low-stock') {
      const medicines = await getLowStockMedicines(auth.user.shopId, 10);
      return createPaginatedResponse(
        medicines,
        medicines.length,
        1,
        medicines.length
      );
    }

    // Near expiry report
    if (reportType === 'near-expiry') {
      const medicines = await getNearExpiryMedicines(auth.user.shopId, 30);
      return createPaginatedResponse(
        medicines,
        medicines.length,
        1,
        medicines.length
      );
    }

    // Get batches for a medicine
    if (medicineId) {
      const batches = await getAvailableBatches(auth.user.shopId, medicineId);
      return createPaginatedResponse(batches, batches.length, 1, batches.length);
    }

    // Get all batches for the shop
    const [batches, total] = await Promise.all([
      prisma.inventoryBatch.findMany({
        where: { shopId: auth.user.shopId, deletedAt: null },
        include: {
          medicine: {
            select: {
              name: true,
              company: true,
              category: true,
              hsn: true,
            },
          },
        },
        orderBy: { expiryDate: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.inventoryBatch.count({ where: { shopId: auth.user.shopId, deletedAt: null } }),
    ]);

    return createPaginatedResponse(batches, total, Math.floor(offset / limit) + 1, limit);
  } catch (error) {
    console.error('Get inventory error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    // Only ADMIN and MANAGER can create batches
    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return createErrorResponse('Forbidden - Insufficient permissions', 403);
    }

    const body = await request.json();

    // Validate input
    const validation = CreateBatchSchema.safeParse(body);
    if (!validation.success) {
      const errs = validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      console.error('Validation failed:', errs);
      return createErrorResponse('Invalid batch data: ' + errs, 400);
    }

    const { medicineId, batchNumber, expiryDate, stockQty, mrp, purchaseRate, sellingRate, rackLocation, packing } =
      validation.data;

    // Verify medicine belongs to shop
    const medicine = await prisma.medicine.findUnique({
      where: { id: medicineId },
      select: { shopId: true },
    });

    if (!medicine || medicine.shopId !== auth.user.shopId) {
      return createErrorResponse('Medicine not found', 404);
    }

    // Update gstPercent if it was provided
    if (typeof validation.data.gstPercent === 'number') {
      await prisma.medicine.update({
        where: { id: medicineId },
        data: { gstPercent: validation.data.gstPercent }
      });
    }

    // Check if batch already exists
    const existingBatch = await prisma.inventoryBatch.findUnique({
      where: {
        shopId_medicineId_batchNumber: {
          shopId: auth.user.shopId,
          medicineId,
          batchNumber,
        }
      }
    });

    if (existingBatch) {
      return createErrorResponse('A batch with this number already exists for this medicine', 400);
    }

    // Create batch
    const batch = await prisma.inventoryBatch.create({
      data: {
        shopId: auth.user.shopId,
        medicineId,
        batchNumber,
        expiryDate: new Date(expiryDate),
        stockQty,
        mrp,
        purchaseRate,
        sellingRate,
        rackLocation: rackLocation?.trim() || null,
        packing: packing?.trim() || '',
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        shopId: auth.user.shopId,
        userId: auth.user.id,
        action: 'CREATE_BATCH',
        meta: JSON.stringify({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          quantity: stockQty,
        }),
      },
    });

    return createApiResponse(true, batch, undefined, 201);
  } catch (error: any) {
    console.error('Create batch error details:', error?.message || error);
    if (error?.code === 'P2002') {
      return createErrorResponse('A batch with this number already exists for this medicine', 400);
    }
    return createErrorResponse(`Internal server error: ${error?.message || error}`, 500);
  }
}
