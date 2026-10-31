import { NextRequest, NextResponse } from 'next/server';
import { Prisma, StockMovementType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { csvCell } from '@/lib/csv';
import { authenticateRequest, createErrorResponse } from '@/middleware/auth';
import { STOCK_MOVEMENT_TYPES } from '@/lib/stock-movement';
import { formatExpiryShort } from '@/lib/batch';

const CSV_ROW_LIMIT = 50_000;

function buildWhere(shopId: string, params: URLSearchParams): Prisma.StockMovementWhereInput {
  const where: Prisma.StockMovementWhereInput = { shopId };

  const from = params.get('from');
  const to = params.get('to');
  if (from || to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (from && !Number.isNaN(Date.parse(from))) createdAt.gte = new Date(from);
    if (to && !Number.isNaN(Date.parse(to))) createdAt.lte = new Date(to);
    where.createdAt = createdAt;
  }

  const types = (params.get('type') || '')
    .split(',')
    .map((t) => t.trim())
    .filter((t): t is StockMovementType => STOCK_MOVEMENT_TYPES.includes(t as StockMovementType));
  if (types.length > 0) where.type = { in: types };

  const medicineId = params.get('medicineId');
  if (medicineId) where.medicineId = medicineId;

  const q = params.get('q')?.trim();
  if (q) where.medicine = { name: { contains: q, mode: 'insensitive' } };

  const batchId = params.get('batchId');
  if (batchId) where.batchId = batchId;

  const batch = params.get('batch')?.trim();
  if (batch) where.batch = { batchNumber: { contains: batch, mode: 'insensitive' } };

  return where;
}

const movementInclude = {
  medicine: { select: { id: true, name: true, company: true } },
  batch: { select: { id: true, batchNumber: true, expiryDate: true } },
  user: { select: { name: true } },
} satisfies Prisma.StockMovementInclude;

type MovementRow = Prisma.StockMovementGetPayload<{ include: typeof movementInclude }>;

/** Human label for each movement's reference (invoice numbers etc.). */
async function resolveRefLabels(shopId: string, rows: MovementRow[]) {
  const idsOf = (refType: string) =>
    Array.from(new Set(rows.filter((r) => r.refType === refType && r.refId).map((r) => r.refId!)));

  const [sales, purchases] = await Promise.all([
    idsOf('SALE').length
      ? prisma.sale.findMany({
          where: { shopId, id: { in: idsOf('SALE') } },
          select: { id: true, invoiceNumber: true },
        })
      : [],
    idsOf('PURCHASE').length
      ? prisma.purchase.findMany({
          where: { shopId, id: { in: idsOf('PURCHASE') } },
          select: { id: true, invoiceNumber: true },
        })
      : [],
  ]);

  const labels = new Map<string, string>();
  sales.forEach((s) => labels.set(`SALE:${s.id}`, s.invoiceNumber));
  purchases.forEach((p) => labels.set(`PURCHASE:${p.id}`, p.invoiceNumber));
  return labels;
}


export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return createErrorResponse('Unauthorized', 401);
    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return createErrorResponse('Forbidden - Insufficient permissions', 403);
    }

    const shopId = auth.user.shopId;
    const params = request.nextUrl.searchParams;
    const where = buildWhere(shopId, params);
    const orderBy: Prisma.StockMovementOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];

    if (params.get('format') === 'csv') {
      const rows = await prisma.stockMovement.findMany({
        where,
        include: movementInclude,
        orderBy,
        take: CSV_ROW_LIMIT,
      });
      const labels = await resolveRefLabels(shopId, rows);

      const header = ['Date', 'Medicine', 'Company', 'Batch', 'Expiry', 'Type', 'Qty Change', 'Balance After', 'Reference Type', 'Reference', 'Note', 'User'];
      const lines = [header.map(csvCell).join(',')];
      for (const row of rows) {
        lines.push(
          [
            row.createdAt.toISOString(),
            row.medicine.name,
            row.medicine.company,
            row.batch.batchNumber,
            formatExpiryShort(row.batch.expiryDate),
            row.type,
            row.qtyChange,
            row.balanceAfter,
            row.refType ?? '',
            row.refId ? labels.get(`${row.refType}:${row.refId}`) ?? row.refId : '',
            row.note ?? '',
            row.user?.name ?? '',
          ]
            .map(csvCell)
            .join(',')
        );
      }

      return new NextResponse(lines.join('\r\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="inventory-history-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const pageSize = Math.min(Math.max(parseInt(params.get('pageSize') || '50', 10) || 50, 1), 200);
    const page = Math.max(parseInt(params.get('page') || '1', 10) || 1, 1);

    const [rows, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: movementInclude,
        orderBy,
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      prisma.stockMovement.count({ where }),
    ]);
    const labels = await resolveRefLabels(shopId, rows);

    // Per-medicine view: batches of the medicine (incl. archived) for the
    // batch filter and the stock summary.
    const medicineId = params.get('medicineId');
    const batches = medicineId
      ? await prisma.inventoryBatch.findMany({
          where: { shopId, medicineId },
          select: { id: true, batchNumber: true, expiryDate: true, stockQty: true, deletedAt: true },
          orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
        })
      : undefined;

    return NextResponse.json({
      success: true,
      data: {
        rows: rows.map((row) => ({
          id: row.id,
          createdAt: row.createdAt,
          type: row.type,
          qtyChange: row.qtyChange,
          balanceAfter: row.balanceAfter,
          refType: row.refType,
          refId: row.refId,
          refLabel: row.refId ? labels.get(`${row.refType}:${row.refId}`) ?? null : null,
          note: row.note,
          userName: row.user?.name ?? null,
          medicine: row.medicine,
          batch: row.batch,
        })),
        batches,
        pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      },
    });
  } catch (error) {
    console.error('Inventory history error:', error);
    return createErrorResponse('Failed to load inventory history', 500);
  }
}
