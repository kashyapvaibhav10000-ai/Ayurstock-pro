import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const authResult = await verifyAuth(req);
    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

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

    await prisma.inventoryBatch.update({
      where: { id, shopId: authResult.user.shopId },
      data: { deletedAt: null },
    });

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
