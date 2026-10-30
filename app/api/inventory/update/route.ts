import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import { batchLabel, normalizeExpiry } from '@/lib/batch';
import { changeBatchStock, findBatchByIdentity } from '@/services/inventory';

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

    const nextQty = Number(stockQty);
    if (!Number.isInteger(nextQty) || nextQty < 0) {
      return NextResponse.json(
        { success: false, message: 'Stock quantity must be a whole number ≥ 0' },
        { status: 400 }
      );
    }

    const nextBatchNumber = String(batchNumber).trim();
    const nextExpiry = normalizeExpiry(expiryDate);

    // Batch identity is medicine + batch number + expiry; editing either must
    // not collide with another existing batch.
    const conflict = await findBatchByIdentity(prisma, {
      shopId: authResult.user.shopId,
      medicineId: existingBatch.medicineId,
      batchNumber: nextBatchNumber,
      expiryDate: nextExpiry,
    });
    if (conflict && conflict.id !== id) {
      return NextResponse.json(
        {
          success: false,
          message: `Another batch ${batchLabel(conflict)} already exists for this medicine. Adjust that batch instead.`,
        },
        { status: 409 }
      );
    }

    const updatedBatch = await prisma.$transaction(async (tx) => {
      const current = await tx.inventoryBatch.findUniqueOrThrow({ where: { id }, select: { stockQty: true } });
      await changeBatchStock(tx, id, nextQty - current.stockQty);
      return tx.inventoryBatch.update({
        where: { id },
        data: {
          batchNumber: nextBatchNumber,
          expiryDate: nextExpiry,
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

    await prisma.inventoryBatch.update({
      where: { id },
      data: { deletedAt: new Date() },
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
