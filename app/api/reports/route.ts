import { NextRequest } from 'next/server';
import { authenticateRequest, createErrorResponse, createApiResponse } from '@/middleware/auth';
import { getDailySalesSummary, getTopSellingMedicines } from '@/services/billing';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    const searchParams = request.nextUrl.searchParams;
    const reportType = searchParams.get('type') || 'daily-sales';
    const startDate = new Date(searchParams.get('startDate') || new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
    const endDate = new Date(searchParams.get('endDate') || new Date().toISOString());

    // Guard against accidentally (or deliberately) requesting a huge date
    // span, which would force every report branch to scan/aggregate years
    // of sales in one request. 2 years is generous for a single shop's
    // reporting needs.
    const MAX_RANGE_DAYS = 730;
    const rangeDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    if (rangeDays > MAX_RANGE_DAYS) {
      return createErrorResponse(
        `Date range too large. Please select a range of ${MAX_RANGE_DAYS} days or less.`,
        400
      );
    }

    if (reportType === 'daily-sales') {
      const report = await getDailySalesSummary(auth.user.shopId, startDate, endDate);
      return createApiResponse(true, { report });
    }

    if (reportType === 'top-medicines') {
      const report = await getTopSellingMedicines(auth.user.shopId, startDate, endDate, 10);
      return createApiResponse(true, { report });
    }

    if (reportType === 'payment-breakdown') {
      const sales = await prisma.sale.groupBy({
        by: ['paymentMode'],
        where: {
          shopId: auth.user.shopId,
          createdAt: { gte: startDate, lte: endDate },
        },
        _count: { paymentMode: true },
        _sum: { grandTotal: true },
      });

      const report = sales.map((s: any) => ({
        paymentMode: s.paymentMode,
        count: s._count.paymentMode,
        total: Number(s._sum.grandTotal || 0),
      }));

      return createApiResponse(true, { report });
    }

    if (reportType === 'summary') {
      // Previously this pulled every Sale row + every SaleItem + its batch's
      // purchaseRate for the whole date range into Node and summed them by
      // hand. Revenue/GST/credit/bill-count can be computed directly in the
      // database with aggregate + groupBy; only COGS needs a join across
      // SaleItem -> InventoryBatch, which we do with one raw SQL SUM instead
      // of loading every item row into memory.
      const shopId = auth.user.shopId;

      const [salesAggregate, creditAggregate, cogsRows] = await Promise.all([
        prisma.sale.aggregate({
          where: { shopId, createdAt: { gte: startDate, lte: endDate } },
          _sum: { grandTotal: true, gstTotal: true },
          _count: { id: true },
        }),
        prisma.sale.aggregate({
          where: {
            shopId,
            createdAt: { gte: startDate, lte: endDate },
            paymentMode: 'CREDIT',
          },
          _sum: { grandTotal: true },
        }),
        prisma.$queryRaw<{ total_cogs: number | null }[]>`
          SELECT COALESCE(SUM(si."quantity" * ib."purchaseRate"), 0) AS total_cogs
          FROM "SaleItem" si
          INNER JOIN "Sale" s ON s."id" = si."saleId"
          INNER JOIN "InventoryBatch" ib ON ib."id" = si."batchId"
          WHERE s."shopId" = ${shopId}
            AND s."createdAt" >= ${startDate}
            AND s."createdAt" <= ${endDate}
        `,
      ]);

      const totalRevenue = Number(salesAggregate._sum.grandTotal || 0);
      const totalGst = Number(salesAggregate._sum.gstTotal || 0);
      const totalCredit = Number(creditAggregate._sum.grandTotal || 0);
      const totalCogs = Number(cogsRows[0]?.total_cogs || 0);
      const totalBills = salesAggregate._count.id;

      const grossProfit = totalRevenue - totalCogs;
      const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

      return createApiResponse(true, {
        report: {
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalBills,
          totalGst: Math.round(totalGst * 100) / 100,
          totalCredit: Math.round(totalCredit * 100) / 100,
          totalCogs: Math.round(totalCogs * 100) / 100,
          grossProfit: Math.round(grossProfit * 100) / 100,
          profitMargin: Math.round(profitMargin * 100) / 100,
        },
      });
    }

    return createErrorResponse('Invalid report type', 400);
  } catch (error) {
    console.error('Get reports error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
