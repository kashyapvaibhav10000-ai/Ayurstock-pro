import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createErrorResponse } from '@/middleware/auth';

/** Line items of one purchase for the Purchase History row expansion. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return createErrorResponse('Unauthorized', 401);
    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return createErrorResponse('Forbidden - Insufficient permissions', 403);
    }

    const { id } = await params;
    const purchase = await prisma.purchase.findFirst({
      where: { id, shopId: auth.user.shopId },
      select: {
        id: true,
        purchaseItems: {
          select: {
            id: true,
            quantity: true,
            freeQty: true,
            purchaseRate: true,
            mrp: true,
            discount: true,
            gst: true,
            packType: true,
            unitsPerPack: true,
            pricePerPack: true,
            medicine: { select: { name: true, company: true, packing: true } },
            batch: { select: { batchNumber: true, expiryDate: true, packing: true } },
          },
        },
      },
    });

    if (!purchase) return createErrorResponse('Purchase not found', 404);

    return NextResponse.json({
      success: true,
      data: purchase.purchaseItems.map((item) => ({
        id: item.id,
        medicine: item.medicine,
        batch: { batchNumber: item.batch.batchNumber, expiryDate: item.batch.expiryDate },
        packing: item.batch.packing || item.medicine.packing || null,
        packType: item.packType,
        unitsPerPack: item.unitsPerPack,
        pricePerPack: item.pricePerPack ? item.pricePerPack.toFixed(2) : null,
        quantity: item.quantity,
        freeQty: item.freeQty,
        purchaseRate: item.purchaseRate ? item.purchaseRate.toDecimalPlaces(4).toString() : null,
        mrp: item.mrp.toFixed(2),
        discount: item.discount.toFixed(2),
        gst: item.gst.toFixed(2),
      })),
    });
  } catch (error) {
    console.error('Purchase detail error:', error);
    return createErrorResponse('Failed to load purchase', 500);
  }
}
