import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const supplier = await prisma.supplier.findFirst({
      where: {
        id: params.id,
        shopId: auth.user.shopId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!supplier) {
      return NextResponse.json(
        { success: false, message: 'Supplier not found' },
        { status: 404 }
      );
    }

    const purchases = await prisma.purchase.findMany({
      where: {
        shopId: auth.user.shopId,
        supplierId: supplier.id,
      },
      orderBy: { invoiceDate: 'desc' },
    });

    const supplierReturns = await prisma.return.findMany({
      where: {
        shopId: auth.user.shopId,
        type: 'SUPPLIER_RETURN',
        referenceId: { in: purchases.map((purchase) => purchase.id) },
      },
      include: {
        batch: {
          select: {
            purchaseRate: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const ledger = [
      ...purchases.map((purchase) => ({
        id: purchase.id,
        date: purchase.invoiceDate,
        type: 'PURCHASE',
        invoice: purchase.invoiceNumber,
        amount: Number(purchase.totalAmount),
        status: purchase.status,
      })),
      ...supplierReturns.map((entry) => ({
        id: entry.id,
        date: entry.createdAt,
        type: 'RETURN',
        invoice: entry.referenceId,
        amount: -Number(entry.batch.purchaseRate) * entry.quantity,
        status: 'ADJUSTED',
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const outstandingBalance = purchases
      .filter((purchase) => purchase.status !== 'PAID')
      .reduce((sum, purchase) => sum + Number(purchase.totalAmount), 0);

    return NextResponse.json({
      success: true,
      data: {
        supplier,
        outstandingBalance,
        ledger,
      },
    });
  } catch (error) {
    console.error('Get supplier ledger error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load supplier ledger' },
      { status: 500 }
    );
  }
}
