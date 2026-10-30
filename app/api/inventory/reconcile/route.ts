import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createErrorResponse } from '@/middleware/auth';
import { recordLedgerCorrection } from '@/lib/stock-movement';

/**
 * Compare each batch's stockQty with the sum of its StockMovement rows and
 * post a correction movement for every mismatch. Stock itself is never
 * changed here; the ledger is aligned to physical stock.
 */
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

    const [batches, sums] = await Promise.all([
      prisma.inventoryBatch.findMany({
        where: { shopId },
        select: { id: true, stockQty: true, batchNumber: true, medicineId: true },
      }),
      prisma.stockMovement.groupBy({
        by: ['batchId'],
        where: { shopId },
        _sum: { qtyChange: true },
      }),
    ]);

    const ledgerByBatch = new Map(sums.map((row) => [row.batchId, row._sum.qtyChange ?? 0]));

    let negativeCount = 0;
    const mismatches: Array<{
      batchId: string;
      batchNumber: string;
      medicineId: string;
      expected: number;
      actual: number;
      diff: number;
    }> = [];

    for (const batch of batches) {
      const ledgerSum = ledgerByBatch.get(batch.id) ?? 0;
      if (batch.stockQty < 0) negativeCount += 1;
      if (ledgerSum !== batch.stockQty) {
        mismatches.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          medicineId: batch.medicineId,
          expected: ledgerSum,
          actual: batch.stockQty,
          diff: batch.stockQty - ledgerSum,
        });
      }
    }

    if (mismatches.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const mismatch of mismatches) {
          await recordLedgerCorrection(tx, {
            shopId,
            batchId: mismatch.batchId,
            ledgerSum: mismatch.expected,
            userId: auth.user.id,
          });
        }
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        totalBatches: batches.length,
        updatedCount: mismatches.length,
        unchangedCount: batches.length - mismatches.length,
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
