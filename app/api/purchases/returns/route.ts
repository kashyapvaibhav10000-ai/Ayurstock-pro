import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const returns = await prisma.return.findMany({
      where: {
        shopId: auth.user.shopId,
        type: 'SUPPLIER_RETURN',
      },
      include: {
        medicine: {
          select: {
            name: true,
            company: true,
          },
        },
        batch: {
          select: {
            batchNumber: true,
          },
        },
        createdByUser: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({
      success: true,
      data: returns,
    });
  } catch (error) {
    console.error('Get purchase returns error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load purchase returns' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { purchaseId, medicineId, batchId, quantity, reason } = body ?? {};

    if (!medicineId || !batchId || !quantity || !reason) {
      return NextResponse.json(
        { success: false, message: 'Missing required return fields' },
        { status: 400 }
      );
    }

    const batch = await prisma.inventoryBatch.findFirst({
      where: {
        id: batchId,
        shopId: auth.user.shopId,
        medicineId,
      },
      select: {
        id: true,
        stockQty: true,
      },
    });

    if (!batch) {
      return NextResponse.json(
        { success: false, message: 'Batch not found' },
        { status: 404 }
      );
    }

    if (batch.stockQty < Number(quantity)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient stock for supplier return' },
        { status: 400 }
      );
    }

    const createdReturn = await prisma.$transaction(async (tx) => {
      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: {
          stockQty: { decrement: Number(quantity) },
        },
      });

      const created = await tx.return.create({
        data: {
          shopId: auth.user!.shopId,
          type: 'SUPPLIER_RETURN',
          referenceId: purchaseId || batchId,
          medicineId,
          batchId,
          quantity: Number(quantity),
          reason: String(reason).trim(),
          createdByUserId: auth.user!.id,
        },
      });

      await tx.stockLedger.create({
        data: {
          shopId: auth.user!.shopId,
          medicineId,
          batchId,
          type: 'SUPPLIER_RETURN',
          qty: Number(quantity),
          referenceId: created.id,
        },
      });

      return created;
    });

    return NextResponse.json({
      success: true,
      data: createdReturn,
      message: 'Purchase return recorded successfully',
    });
  } catch (error) {
    console.error('Create purchase return error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to record purchase return' },
      { status: 500 }
    );
  }
}
