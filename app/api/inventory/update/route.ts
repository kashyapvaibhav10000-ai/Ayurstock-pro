import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export async function PUT(req: NextRequest) {
  try {
    const authResult = await verifyAuth(req);
    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    if (!['ADMIN', 'MANAGER'].includes(authResult.user.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { id, batchNumber, expiryDate, stockQty, purchaseRate, mrp, rackLocation, packing } = body ?? {};

    if (!id || !batchNumber || !expiryDate || stockQty === undefined || purchaseRate === undefined || mrp === undefined) {
      return NextResponse.json(
        { success: false, message: 'Missing required inventory fields' },
        { status: 400 }
      );
    }

    const existingBatch = await prisma.inventoryBatch.findFirst({
      where: {
        id,
        shopId: authResult.user.shopId,
      },
      include: {
        medicine: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!existingBatch) {
      return NextResponse.json(
        { success: false, message: 'Inventory batch not found' },
        { status: 404 }
      );
    }

    const updatedBatch = await prisma.$transaction(async (tx) => {
      return tx.inventoryBatch.update({
        where: { id },
        data: {
          batchNumber: String(batchNumber).trim(),
          expiryDate: new Date(expiryDate),
          stockQty: Number(stockQty),
          purchaseRate: Number(purchaseRate),
          mrp: Number(mrp),
          sellingRate: Number(mrp),
          rackLocation:
            typeof rackLocation === 'string' && rackLocation.trim() ? rackLocation.trim() : null,
          packing:
            typeof packing === 'string' ? packing.trim() : '',
        },
        include: {
          medicine: {
            select: {
              id: true,
              name: true,
              company: true,
              category: true,
              hsn: true,
            },
          },
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: updatedBatch,
      message: 'Inventory batch updated successfully',
    });
  } catch (error) {
    console.error('Inventory update error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update inventory' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await verifyAuth(req);
    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    if (!['ADMIN', 'MANAGER'].includes(authResult.user.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json(
        { success: false, message: 'Inventory batch id is required' },
        { status: 400 }
      );
    }

    const batch = await prisma.inventoryBatch.findFirst({
      where: {
        id,
        shopId: authResult.user.shopId,
      },
      select: { id: true },
    });

    if (!batch) {
      return NextResponse.json(
        { success: false, message: 'Inventory batch not found' },
        { status: 404 }
      );
    }

    await prisma.inventoryBatch.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Inventory batch deleted successfully',
    });
  } catch (error) {
    console.error('Inventory delete error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to delete inventory batch' },
      { status: 500 }
    );
  }
}
