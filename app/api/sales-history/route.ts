import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createErrorResponse } from '@/middleware/auth';
import { NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    const { shopId } = auth.user;
    const searchParams = request.nextUrl.searchParams;

    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    const startDate = startDateParam
      ? new Date(startDateParam)
      : new Date(new Date().setDate(new Date().getDate() - 30));

    const endDate = endDateParam ? new Date(endDateParam) : new Date();
    endDate.setHours(23, 59, 59, 999);
    startDate.setHours(0, 0, 0, 0);

    const dateFilter = { gte: startDate, lte: endDate };

    // Totals for the summary cards are computed via DB aggregates instead of
    // JS reduce over the full row set fetched below (the row set is still
    // needed for the per-item tables, but the totals no longer depend on it).
    const [salesAggregate, purchaseAggregate, returnAggregate] = await Promise.all([
      prisma.sale.aggregate({
        where: { shopId, createdAt: dateFilter },
        _sum: { grandTotal: true },
        _count: { id: true },
      }),
      prisma.purchase.aggregate({
        where: { shopId, createdAt: dateFilter },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      prisma.$queryRaw<{ total_returns: number | null; returns_count: bigint }[]>`
        SELECT COALESCE(SUM(r."quantity" * ib."mrp"), 0) AS total_returns, COUNT(*) AS returns_count
        FROM "Return" r
        INNER JOIN "InventoryBatch" ib ON ib."id" = r."batchId"
        WHERE r."shopId" = ${shopId}
          AND r."createdAt" >= ${startDate}
          AND r."createdAt" <= ${endDate}
      `,
    ]);

    const [sales, purchases, returns] = await Promise.all([
      prisma.sale.findMany({
        where: { shopId, createdAt: dateFilter },
        select: {
          id: true,
          invoiceNumber: true,
          grandTotal: true,
          discountTotal: true,
          gstTotal: true,
          paymentMode: true,
          saleType: true,
          createdAt: true,
          customer: { select: { name: true } },
          saleItems: {
            select: {
              quantity: true,
              amount: true,
              rate: true,
              medicine: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),

      prisma.purchase.findMany({
        where: { shopId, createdAt: dateFilter },
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          totalAmount: true,
          discountTotal: true,
          gstTotal: true,
          paymentType: true,
          status: true,
          createdAt: true,
          supplier: { select: { name: true } },
          purchaseItems: {
            select: {
              quantity: true,
              purchaseRate: true,
              medicine: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),

      prisma.return.findMany({
        where: { shopId, createdAt: dateFilter },
        select: {
          id: true,
          type: true,
          quantity: true,
          reason: true,
          createdAt: true,
          medicine: { select: { name: true } },
          batch: { select: { mrp: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const totalSalesRevenue = Number(salesAggregate._sum.grandTotal || 0);
    const totalPurchaseCost = Number(purchaseAggregate._sum.totalAmount || 0);
    const totalReturnsAmount = Number(returnAggregate[0]?.total_returns || 0);
    const grossProfit = totalSalesRevenue - totalPurchaseCost - totalReturnsAmount;

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalSalesRevenue,
          totalPurchaseCost,
          totalReturnsAmount,
          grossProfit,
          salesCount: sales.length,
          purchasesCount: purchases.length,
          returnsCount: returns.length,
        },
        sales: sales.map((s) => ({
          id: s.id,
          invoiceNumber: s.invoiceNumber,
          date: s.createdAt,
          customer: s.customer?.name ?? 'Walk-in',
          itemCount: s.saleItems.length,
          total: Number(s.grandTotal),
          discount: Number(s.discountTotal),
          gst: Number(s.gstTotal),
          paymentMode: s.paymentMode,
          saleType: s.saleType,
        })),
        purchases: purchases.map((p) => ({
          id: p.id,
          invoiceNumber: p.invoiceNumber,
          date: p.createdAt,
          supplier: p.supplier.name,
          itemCount: p.purchaseItems.length,
          total: Number(p.totalAmount),
          discount: Number(p.discountTotal),
          gst: Number(p.gstTotal),
          paymentType: p.paymentType,
          status: p.status,
        })),
        returns: returns.map((r) => ({
          id: r.id,
          date: r.createdAt,
          type: r.type,
          medicine: r.medicine.name,
          quantity: r.quantity,
          amount: r.quantity * Number(r.batch?.mrp ?? 0),
          reason: r.reason,
        })),
      },
    });
  } catch (error) {
    console.error('Sales history error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
