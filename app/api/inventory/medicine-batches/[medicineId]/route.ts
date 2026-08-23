import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: { medicineId: string } }
) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { medicineId } = params;
    const { searchParams } = new URL(req.url);
    const highlightBatchId = searchParams.get('highlightBatchId');

    // Get medicine details
    const medicine = await prisma.medicine.findFirst({
      where: {
        id: medicineId,
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
      return NextResponse.json({ success: false, message: 'Medicine not found' }, { status: 404 });
    }

    // SAFETY CHECK: if highlightBatchId is provided, verify it belongs to this medicine.
    // If it doesn't match (data inconsistency), look up the correct medicine from the batch.
    let resolvedMedicineId = medicineId;
    if (highlightBatchId) {
      const highlightedBatch = await prisma.inventoryBatch.findFirst({
        where: {
          id: highlightBatchId,
          shopId: auth.user.shopId,
        },
        select: { medicineId: true },
      });

      if (highlightedBatch && highlightedBatch.medicineId !== medicineId) {
        // The batch belongs to a different medicine — use the correct one from the batch
        console.warn(
          `[medicine-batches] medicineId mismatch: passed ${medicineId} but batch ${highlightBatchId} belongs to ${highlightedBatch.medicineId}. Using batch's actual medicineId.`
        );
        resolvedMedicineId = highlightedBatch.medicineId;
      }
    }

    // If we resolved to a different medicine, re-fetch it
    const resolvedMedicine = resolvedMedicineId !== medicineId
      ? await prisma.medicine.findFirst({
          where: { id: resolvedMedicineId, shopId: auth.user.shopId },
          select: { id: true, name: true, company: true, category: true },
        }) ?? medicine
      : medicine;

    // Get ALL active batches of this medicine (both zero and non-zero stock)
    const batches = await prisma.inventoryBatch.findMany({
      where: {
        medicineId: resolvedMedicineId,
        shopId: auth.user.shopId,
        deletedAt: null,
      },
      orderBy: [{ expiryDate: 'asc' }, { stockQty: 'desc' }],
    });

    // Get last activity for each batch
    const batchIds = batches.map((b) => b.id);
    const lastActivities = batchIds.length
      ? await prisma.stockLedger.groupBy({
          by: ['batchId'],
          where: {
            batchId: { in: batchIds },
          },
          _max: {
            createdAt: true,
          },
        })
      : [];

    const activityMap = new Map(lastActivities.map((a) => [a.batchId, a._max.createdAt]));

    // Calculate total active stock
    const totalActiveStock = batches.reduce((sum, batch) => sum + batch.stockQty, 0);

    const enrichedBatches = batches.map((batch) => {
      const lastActivityDate = activityMap.get(batch.id) || batch.createdAt;
      const isZeroStock = batch.stockQty === 0;
      const isHighlighted = batch.id === highlightBatchId;

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
        isHighlighted,
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
        medicine: {
          ...resolvedMedicine,
          totalActiveStock,
        },
        batches: enrichedBatches,
      },
    });
  } catch (error) {
    console.error('Get medicine batches error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch medicine batches' },
      { status: 500 }
    );
  }
}
