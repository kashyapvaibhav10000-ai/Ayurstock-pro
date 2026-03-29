import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createApiResponse, createErrorResponse } from '@/middleware/auth';

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
      where.type = { in: ['PURCHASE', 'ADJUSTMENT_IN', 'RETURN'] };
    } else if (type === 'OUT') {
      where.type = { in: ['SALE', 'ADJUSTMENT_OUT'] };
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

    // To calculate running balance, we need all entries for the related medicine+batch ordered by time
    // But evaluating running balance globally on the fly across pagination is hard, 
    // we'll compute running balance historically for the returned subset by fetching all older rows for those batches and summing them up.
    // Given the prompt "calculate cumulative stock from oldest to newest entry, return it per row",
    // We can fetch the sum of all qty changes for that medicine+batch before this particular ledger entry.
    // A simplified approach for smaller scale:

    const enrichedEntries = await Promise.all(
      entries.map(async (entry) => {
        // compute cumulative qty before this entry
        // + IN types minus OUT types
        const previousEntries = await prisma.stockLedger.findMany({
          where: {
            shopId: auth.user.shopId,
            batchId: entry.batchId,
            createdAt: { lte: entry.createdAt },
          },
        });

        const runningBalance = previousEntries.reduce((acc, curr) => {
          if (['PURCHASE', 'ADJUSTMENT_IN', 'RETURN'].includes(curr.type)) {
            return acc + curr.qty;
          }
          if (['SALE', 'ADJUSTMENT_OUT'].includes(curr.type)) {
            return acc - curr.qty;
          }
          return acc;
        }, 0);

        return {
          id: entry.id,
          createdAt: entry.createdAt,
          medicineName: entry.medicine?.name || 'Unknown',
          batchNumber: entry.batch?.batchNumber || 'Unknown',
          type: entry.type,
          quantity: entry.qty,
          referenceId: entry.referenceId,
          notes: '', // standard StockLedger doesn't have notes, we can leave empty or fetch from StockAdjustment if needed
          runningBalance,
        };
      })
    );

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
