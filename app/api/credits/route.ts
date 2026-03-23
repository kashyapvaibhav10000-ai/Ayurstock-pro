import { NextRequest } from 'next/server';
import { authenticateRequest, createApiResponse, createErrorResponse } from '@/middleware/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return createErrorResponse('Unauthorized', 401);

    const sales = await prisma.sale.findMany({
      where: {
        shopId: auth.user.shopId,
        creditDue: { gt: 0 },
      },
      select: {
        id: true,
        invoiceNumber: true,
        grandTotal: true,
        creditDue: true,
        paymentMode: true,
        createdAt: true,
        customer: {
          select: { id: true, name: true, phone: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by customer
    const byCustomer = new Map<string, {
      customerId: string;
      customerName: string;
      customerPhone: string;
      totalDue: number;
      sales: typeof sales;
    }>();

    for (const sale of sales) {
      const key = sale.customer?.id ?? 'walk-in';
      const name = sale.customer?.name ?? 'Walk-in Customer';
      const phone = sale.customer?.phone ?? '';
      const due = Number(sale.creditDue ?? 0);

      if (!byCustomer.has(key)) {
        byCustomer.set(key, { customerId: key, customerName: name, customerPhone: phone, totalDue: 0, sales: [] });
      }
      const entry = byCustomer.get(key)!;
      entry.totalDue += due;
      entry.sales.push(sale);
    }

    const result = Array.from(byCustomer.values()).map((entry) => ({
      ...entry,
      totalDue: Math.round(entry.totalDue * 100) / 100,
      sales: entry.sales.map((s) => ({
        id: s.id,
        invoiceNumber: s.invoiceNumber,
        grandTotal: Number(s.grandTotal),
        creditDue: Number(s.creditDue),
        createdAt: s.createdAt,
      })),
    }));

    return createApiResponse(true, result);
  } catch {
    return createErrorResponse('Internal server error', 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return createErrorResponse('Unauthorized', 401);

    const { saleId, amount } = await request.json();
    if (!saleId) return createErrorResponse('saleId is required', 400);

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, shopId: auth.user.shopId },
      select: { id: true, creditDue: true, invoiceNumber: true },
    });

    if (!sale) return createErrorResponse('Sale not found', 404);

    const currentDue = Number(sale.creditDue ?? 0);
    const payAmount = typeof amount === 'number' ? Math.min(amount, currentDue) : currentDue;
    const newDue = Math.max(0, Math.round((currentDue - payAmount) * 100) / 100);

    const updated = await prisma.sale.update({
      where: { id: saleId },
      data: { creditDue: newDue },
    });

    await prisma.activityLog.create({
      data: {
        shopId: auth.user.shopId,
        userId: auth.user.id,
        action: 'CREDIT_PAYMENT',
        meta: JSON.stringify({ saleId, invoiceNumber: sale.invoiceNumber, paidAmount: payAmount, remainingDue: newDue }),
      },
    });

    return createApiResponse(true, { creditDue: Number(updated.creditDue) });
  } catch {
    return createErrorResponse('Internal server error', 500);
  }
}
