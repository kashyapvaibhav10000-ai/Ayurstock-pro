import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: supplierId } = await params;
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const purchases = await prisma.purchase.findMany({
      where: {
        shopId: auth.user.shopId,
        supplierId: supplierId,
      },
      include: {
        purchaseItems: {
          select: {
            id: true,
            quantity: true,
            freeQty: true,
            batch: {
              select: {
                batchNumber: true,
              },
            },
            medicine: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { invoiceDate: 'desc' },
      take: 100,
    });

    return NextResponse.json({
      success: true,
      data: purchases.map((purchase) => ({
        ...purchase,
        totalAmount: Number(purchase.totalAmount),
        subtotal: Number(purchase.subtotal),
        discountTotal: Number(purchase.discountTotal),
        gstTotal: Number(purchase.gstTotal),
      })),
    });
  } catch (error) {
    console.error('Get supplier purchases error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load supplier purchases' },
      { status: 500 }
    );
  }
}
