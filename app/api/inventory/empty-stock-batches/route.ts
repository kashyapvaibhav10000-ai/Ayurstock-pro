import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';

    // Get all zero-stock batches with medicine info
    const emptyBatches = await prisma.inventoryBatch.findMany({
      where: {
        shopId: auth.user.shopId,
        stockQty: 0,
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { medicine: { name: { contains: search, mode: 'insensitive' } } },
                { batchNumber: { contains: search, mode: 'insensitive' } },
                { medicine: { company: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: {
        medicine: {
          select: {
            id: true,
            name: true,
            company: true,
            category: true,
          },
        },
      },
      orderBy: { expiryDate: 'asc' },
    });

    // Get last activity for each batch from stock ledger
    const batchIds = emptyBatches.map((b) => b.id);
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

    const now = new Date();
    const enrichedBatches = emptyBatches.map((batch) => {
      const lastActivityDate = activityMap.get(batch.id) || batch.createdAt;
      const daysAgo = Math.floor((now.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24));

      return {
        id: batch.id,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        stockQty: batch.stockQty,
        mrp: Number(batch.mrp),
        purchaseRate: batch.purchaseRate ? Number(batch.purchaseRate) : null,
        sellingRate: Number(batch.sellingRate),
        rackLocation: batch.rackLocation,
        medicine: batch.medicine,
        lastActivity: {
          date: lastActivityDate,
          daysAgo,
        },
      };
    });

    return NextResponse.json({
      success: true,
      data: enrichedBatches,
      count: enrichedBatches.length,
    });
  } catch (error) {
    console.error('Get empty stock batches error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch empty stock batches' },
      { status: 500 }
    );
  }
}
