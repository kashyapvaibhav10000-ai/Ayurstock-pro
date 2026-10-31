import { NextRequest, NextResponse } from 'next/server';
import { Prisma, PurchaseSource } from '@prisma/client';
import { prisma } from '@/lib/db';
import { csvCell } from '@/lib/csv';
import { authenticateRequest, createErrorResponse } from '@/middleware/auth';

const SOURCES: PurchaseSource[] = ['INVOICE', 'AI_IMPORT', 'MANUAL'];
const CSV_ROW_LIMIT = 20_000;

function buildWhere(shopId: string, params: URLSearchParams): Prisma.PurchaseWhereInput {
  const where: Prisma.PurchaseWhereInput = { shopId };

  const from = params.get('from');
  const to = params.get('to');
  if (from || to) {
    const invoiceDate: Prisma.DateTimeFilter = {};
    if (from && !Number.isNaN(Date.parse(from))) invoiceDate.gte = new Date(from);
    if (to && !Number.isNaN(Date.parse(to))) invoiceDate.lte = new Date(to);
    where.invoiceDate = invoiceDate;
  }

  const supplierId = params.get('supplierId');
  if (supplierId) where.supplierId = supplierId;

  const source = params.get('source');
  if (source && SOURCES.includes(source as PurchaseSource)) where.source = source as PurchaseSource;

  const invoice = params.get('invoice')?.trim();
  if (invoice) where.invoiceNumber = { contains: invoice, mode: 'insensitive' };

  return where;
}

const listInclude = {
  supplier: { select: { id: true, name: true } },
  createdByUser: { select: { name: true } },
  _count: { select: { purchaseItems: true } },
} satisfies Prisma.PurchaseInclude;

type ListRow = Prisma.PurchaseGetPayload<{ include: typeof listInclude }>;

const money = (value: Prisma.Decimal) => value.toFixed(2);

function toRow(p: ListRow) {
  return {
    id: p.id,
    invoiceDate: p.invoiceDate,
    createdAt: p.createdAt,
    source: p.source,
    supplier: p.supplier,
    invoiceNumber: p.invoiceNumber,
    itemCount: p._count.purchaseItems,
    taxable: money(p.subtotal.minus(p.discountTotal)),
    gst: money(p.gstTotal),
    total: money(p.totalAmount),
    enteredBy: p.createdByUser?.name ?? null,
    documentId: p.documentId,
    notes: p.notes,
  };
}


export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return createErrorResponse('Unauthorized', 401);
    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return createErrorResponse('Forbidden - Insufficient permissions', 403);
    }

    const params = request.nextUrl.searchParams;
    const where = buildWhere(auth.user.shopId, params);
    const orderBy: Prisma.PurchaseOrderByWithRelationInput[] = [{ invoiceDate: 'desc' }, { createdAt: 'desc' }];

    if (params.get('format') === 'csv') {
      const purchases = await prisma.purchase.findMany({ where, include: listInclude, orderBy, take: CSV_ROW_LIMIT });
      const header = ['Date', 'Source', 'Distributor', 'Invoice No', 'Items', 'Taxable', 'GST', 'Total', 'Entered By', 'Notes'];
      const lines = [header.map(csvCell).join(',')];
      for (const row of purchases.map(toRow)) {
        lines.push(
          [
            row.invoiceDate.toISOString().slice(0, 10),
            row.source,
            row.supplier.name,
            row.invoiceNumber,
            row.itemCount,
            row.taxable,
            row.gst,
            row.total,
            row.enteredBy ?? '',
            row.notes ?? '',
          ]
            .map(csvCell)
            .join(',')
        );
      }
      return new NextResponse(lines.join('\r\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="purchase-history-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const pageSize = Math.min(Math.max(parseInt(params.get('pageSize') || '25', 10) || 25, 1), 100);
    const page = Math.max(parseInt(params.get('page') || '1', 10) || 1, 1);

    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({ where, include: listInclude, orderBy, take: pageSize, skip: (page - 1) * pageSize }),
      prisma.purchase.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        rows: purchases.map(toRow),
        pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      },
    });
  } catch (error) {
    console.error('Purchase history error:', error);
    return createErrorResponse('Failed to load purchase history', 500);
  }
}
