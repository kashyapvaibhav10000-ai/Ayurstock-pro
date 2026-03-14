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

    const purchase = await prisma.purchase.findFirst({
      where: {
        id: params.id,
        shopId: auth.user.shopId,
      },
      include: {
        supplier: true,
        purchaseItems: {
          include: {
            medicine: {
              select: {
                id: true,
                name: true,
                company: true,
              },
            },
            batch: {
              select: {
                id: true,
                batchNumber: true,
                rackLocation: true,
                stockQty: true,
              },
            },
          },
        },
      },
    });

    if (!purchase) {
      return NextResponse.json(
        { success: false, message: 'Purchase not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...purchase,
        totalAmount: Number(purchase.totalAmount),
        subtotal: Number(purchase.subtotal),
        discountTotal: Number(purchase.discountTotal),
        gstTotal: Number(purchase.gstTotal),
        purchaseItems: purchase.purchaseItems.map((item) => ({
          ...item,
          purchaseRate: Number(item.purchaseRate),
          mrp: Number(item.mrp),
          discount: Number(item.discount),
          gst: Number(item.gst),
        })),
      },
    });
  } catch (error) {
    console.error('Get purchase detail error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load purchase' },
      { status: 500 }
    );
  }
}
