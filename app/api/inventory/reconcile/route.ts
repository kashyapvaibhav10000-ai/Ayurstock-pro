import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createErrorResponse } from '@/middleware/auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return createErrorResponse('Forbidden - Insufficient permissions', 403);
    }

    const shopId = auth.user.shopId;

    const [batches, ledgerEntries] = await Promise.all([
      prisma.inventoryBatch.findMany({
        where: { shopId },
        select: { id: true, stockQty: true, batchNumber: true, medicineId: true },
      }),
      prisma.stockLedger.findMany({
        where: { shopId },
        select: { batchId: true, qty: true, type: true },
      }),
    ]);

    const stockMap = new Map<string, number>();

    for (const entry of ledgerEntries) {
      const current = stockMap.get(entry.batchId) || 0;
      if (entry.type === 'PURCHASE' || entry.type === 'CUSTOMER_RETURN' || entry.type === 'ADJUSTMENT') {
        stockMap.set(entry.batchId, current + Number(entry.qty));
      } else if (entry.type === 'SALE' || entry.type === 'SUPPLIER_RETURN') {
        stockMap.set(entry.batchId, current - Number(entry.qty));
      }
    }

    let updatedCount = 0;
    let unchangedCount = 0;
    let negativeCount = 0;
    const mismatches: Array<{
      batchId: string;
      batchNumber: string;
      medicineId: string;
      expected: number;
      actual: number;
      diff: number;
    }> = [];

    const updates = batches
      .map((batch) => {
        const nextQty = stockMap.get(batch.id) ?? 0;
        if (nextQty < 0) {
          negativeCount += 1;
        }
        if (batch.stockQty === nextQty) {
          unchangedCount += 1;
          return null;
        }
        updatedCount += 1;
        mismatches.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          medicineId: batch.medicineId,
          expected: nextQty,
          actual: batch.stockQty,
          diff: nextQty - batch.stockQty,
        });
        return prisma.inventoryBatch.update({
          where: { id: batch.id },
          data: { stockQty: nextQty },
        });
      })
      .filter(Boolean) as ReturnType<typeof prisma.inventoryBatch.update>[];

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }

    return NextResponse.json({
      success: true,
      data: {
        totalBatches: batches.length,
        updatedCount,
        unchangedCount,
        negativeCount,
        mismatches,
      },
      message: 'Inventory reconciliation completed',
    });
  } catch (error) {
    console.error('Inventory reconciliation error:', error);
    return createErrorResponse('Failed to reconcile inventory', 500);
  }
}
