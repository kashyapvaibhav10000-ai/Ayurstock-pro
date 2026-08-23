import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

/**
 * GET /api/inventory/batch-details?batchId=xxx
 *
 * Takes a single batchId, looks up which medicine it belongs to,
 * then returns all batches for that medicine.
 *
 * This is the authoritative endpoint for "View Batches" — it NEVER
 * relies on a client-supplied medicineId, eliminating all mismatch bugs.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get('batchId');

    if (!batchId) {
      return NextResponse.json(
        { success: false, message: 'batchId is required' },
        { status: 400 }
      );
    }

    // Step 1: Look up the batch directly by its own ID — get its actual medicineId
    const sourceBatch = await prisma.inventoryBatch.findFirst({
      where: {
        id: batchId,
        shopId: auth.user.shopId,
        deletedAt: null,
      },
      select: {
        id: true,
        medicineId: true,
      },
    });

    if (!sourceBatch) {
      return NextResponse.json(
        { success: false, message: 'Batch not found' },
        { status: 404 }
      );
    }

    const trueMedicineId = sourceBatch.medicineId;

    // Step 2: Get medicine details from the real medicineId
    const medicine = await prisma.medicine.findFirst({
      where: {
        id: trueMedicineId,
        shopId: auth.user.shopId,
      },
      select: {
        id: true,
        name: true,
        company: true,
        category: true,
      },
    });

    if (!medicine) {
      return NextResponse.json(
        { success: false, message: 'Medicine not found' },
        { status: 404 }
      );
    }

    // Step 3: Get ALL batches for this medicine
    const batches = await prisma.inventoryBatch.findMany({
      where: {
        medicineId: trueMedicineId,
        shopId: auth.user.shopId,
        deletedAt: null,
      },
      orderBy: [{ expiryDate: 'asc' }, { stockQty: 'desc' }],
    });

    // Step 4: Get last activity for each batch
    const batchIds = batches.map((b) => b.id);
    const lastActivities = batchIds.length
      ? await prisma.stockLedger.groupBy({
          by: ['batchId'],
          where: { batchId: { in: batchIds } },
          _max: { createdAt: true },
        })
      : [];

    const activityMap = new Map(lastActivities.map((a) => [a.batchId, a._max.createdAt]));
    const totalActiveStock = batches.reduce((sum, b) => sum + b.stockQty, 0);

    const enrichedBatches = batches.map((batch) => {
      const lastActivityDate = activityMap.get(batch.id) || batch.createdAt;
      const isZeroStock = batch.stockQty === 0;

      return {
        id: batch.id,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        stockQty: batch.stockQty,
        mrp: Number(batch.mrp),
        purchaseRate: batch.purchaseRate ? Number(batch.purchaseRate) : null,
        sellingRate: Number(batch.sellingRate),
        rackLocation: batch.rackLocation,
        status: isZeroStock ? 'ZERO_STOCK' : 'ACTIVE',
        isHighlighted: batch.id === batchId,   // highlight the exact batch clicked
        canArchive: isZeroStock,
        lastActivity: {
          date: lastActivityDate,
          daysAgo: Math.floor(
            (new Date().getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)
          ),
        },
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        medicine: { ...medicine, totalActiveStock },
        batches: enrichedBatches,
      },
    });
  } catch (error) {
    console.error('Get batch details error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch batch details' },
      { status: 500 }
    );
  }
}
