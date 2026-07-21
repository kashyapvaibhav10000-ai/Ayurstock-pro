import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createApiResponse, createErrorResponse } from '@/middleware/auth';
import { STOCK_IN_TYPES, STOCK_OUT_TYPES, signedLedgerQty } from '@/lib/stock-ledger';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return createErrorResponse('Unauthorized', 401);

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');
    const search = searchParams.get('search')?.trim().toLowerCase();
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const offset = Math.max(0, (page - 1) * limit);

    const where: any = { shopId: auth.user.shopId };

    if (type === 'IN') {
      where.type = { in: [...STOCK_IN_TYPES] };
    } else if (type === 'OUT') {
      where.type = { in: [...STOCK_OUT_TYPES] };
    }

    if (search) {
      where.medicine = { name: { contains: search, mode: 'insensitive' } };
    }

    const [entries, total] = await Promise.all([
      prisma.stockLedger.findMany({
        where,
        include: {
          medicine: { select: { name: true } },
          batch: { select: { batchNumber: true, stockQty: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.stockLedger.count({ where }),
    ]);

    // Running balance = cumulative sum of signed qty for a batch, from its oldest
    // entry up to a given entry. Previously this issued one extra findMany PER ROW
    // on the page (up to `limit` queries) just to sum "everything before it".
    // Instead, fetch every ledger row for the batches present on this page ONCE,
    // then compute cumulative balances per batch in memory.
    const batchIds = Array.from(new Set(entries.map((entry) => entry.batchId)));

    const runningBalanceByEntryId = new Map<string, number>();

    if (batchIds.length > 0) {
      const allRowsForBatches = await prisma.stockLedger.findMany({
        where: {
          shopId: auth.user.shopId,
          batchId: { in: batchIds },
        },
        select: { id: true, batchId: true, type: true, qty: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

      const cumulativeByBatch = new Map<string, number>();
      for (const row of allRowsForBatches) {
        const runningTotal =
          (cumulativeByBatch.get(row.batchId) || 0) + signedLedgerQty(row.type, row.qty);
        cumulativeByBatch.set(row.batchId, runningTotal);
        runningBalanceByEntryId.set(row.id, runningTotal);
      }
    }

    const enrichedEntries = entries.map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      medicineName: entry.medicine?.name || 'Unknown',
      batchNumber: entry.batch?.batchNumber || 'Unknown',
      type: entry.type,
      quantity: entry.qty,
      referenceId: entry.referenceId,
      notes: '', // standard StockLedger doesn't have notes, we can leave empty or fetch from StockAdjustment if needed
      runningBalance: runningBalanceByEntryId.get(entry.id) ?? 0,
    }));

    return createApiResponse(true, {
      data: enrichedEntries,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Failed to get stock ledger:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
