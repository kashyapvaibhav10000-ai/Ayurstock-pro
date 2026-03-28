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
      const sales = await prisma.sale.findMany({
        where: {
          shopId: auth.user.shopId,
          createdAt: { gte: startDate, lte: endDate },
        },
        select: {
          grandTotal: true,
          gstTotal: true,
          paymentMode: true,
          items: {
            select: {
              quantity: true,
              rate: true,
              amount: true,
              batch: {
                select: { purchaseRate: true },
              },
            },
          },
        },
      });

      let totalRevenue = 0;
      let totalGst = 0;
      let totalCredit = 0;
      let totalCogs = 0;

      sales.forEach((sale: any) => {
        totalRevenue += Number(sale.grandTotal || 0);
        totalGst += Number(sale.gstTotal || 0);
        if (sale.paymentMode === 'CREDIT') totalCredit += Number(sale.grandTotal || 0);
        sale.items.forEach((item: any) => {
          const purchaseRate = Number(item.batch?.purchaseRate || 0);
          totalCogs += purchaseRate * item.quantity;
        });
      });

      const grossProfit = totalRevenue - totalCogs;
      const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

      return createApiResponse(true, {
        report: {
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalBills: sales.length,
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
