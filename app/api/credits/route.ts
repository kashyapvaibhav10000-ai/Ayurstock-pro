import { NextRequest } from 'next/server';
import { authenticateRequest, createApiResponse, createErrorResponse, staffOnlyResponse } from '@/middleware/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return createErrorResponse('Unauthorized', 401);

    const notStaff = staffOnlyResponse(auth.user.role);
    if (notStaff) return notStaff;

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

    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return createErrorResponse('Forbidden - Insufficient permissions', 403);
    }

    const { saleId, amount } = (await request.json().catch(() => null)) ?? {};
    if (!saleId || typeof saleId !== 'string') return createErrorResponse('saleId is required', 400);
    // A payment can only reduce what is owed.
    if (amount !== undefined && (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)) {
      return createErrorResponse('Amount must be a positive number', 400);
    }

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, shopId: auth.user.shopId },
      select: { id: true, creditDue: true, invoiceNumber: true },
    });

    if (!sale) return createErrorResponse('Sale not found', 404);

    const currentDue = Number(sale.creditDue ?? 0);
    const payAmount = Math.round((typeof amount === 'number' ? Math.min(amount, currentDue) : currentDue) * 100) / 100;

    // One conditional UPDATE: a payment racing another one cannot overwrite it
    // with a stale balance. If the balance no longer covers it, refuse.
    const applied = await prisma.sale.updateMany({
      where: { id: sale.id, shopId: auth.user.shopId, creditDue: { gte: payAmount } },
      data: { creditDue: { decrement: payAmount } },
    });
    if (applied.count === 0) {
      return createErrorResponse('The balance changed while saving. Refresh and try again.', 409);
    }
    const updated = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id }, select: { creditDue: true } });
    const newDue = Number(updated.creditDue ?? 0);

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
