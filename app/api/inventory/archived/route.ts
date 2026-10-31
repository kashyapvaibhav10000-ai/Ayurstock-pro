import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import { staffOnlyResponse } from '@/middleware/auth';
import { recordMovement } from '@/lib/stock-movement';

export async function GET(req: NextRequest) {
  try {
    const authResult = await verifyAuth(req);
    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const notStaff = staffOnlyResponse(authResult.user!.role);
    if (notStaff) return notStaff;

    const archivedBatches = await prisma.inventoryBatch.findMany({
      where: {
        shopId: authResult.user.shopId,
        deletedAt: { not: null },
      },
      include: {
        medicine: {
          select: { name: true, company: true }
        }
      },
      orderBy: { deletedAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: archivedBatches,
    });
  } catch (error) {
    console.error('Fetch archived batches error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch archived batches' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
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

    const { id } = await req.json();
    if (!id) {
      return NextResponse.json(
        { success: false, message: 'Batch ID is required' },
        { status: 400 }
      );
    }

    const user = authResult.user;
    const batch = await prisma.inventoryBatch.findFirst({
      where: { id, shopId: user.shopId },
      select: { id: true, deletedAt: true },
    });
    if (!batch) {
      return NextResponse.json({ success: false, message: 'Batch not found' }, { status: 404 });
    }

    if (batch.deletedAt) {
      await prisma.$transaction(async (tx) => {
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: { deletedAt: null },
        });
        await recordMovement(tx, {
          shopId: user.shopId,
          batchId: batch.id,
          type: 'RESTORE',
          qtyChange: 0,
          note: 'Batch restored from archive',
          userId: user.id,
        });
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Batch restored successfully',
    });
  } catch (error) {
    console.error('Restore batch error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to restore batch' },
      { status: 500 }
    );
  }
}
