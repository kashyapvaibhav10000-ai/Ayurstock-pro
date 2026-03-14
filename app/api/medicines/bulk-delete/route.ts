import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

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

    const { ids }: { ids: string[] } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Medicine ids are required' },
        { status: 400 }
      );
    }

    const blockedBatches = await prisma.inventoryBatch.findMany({
      where: {
        shopId: authResult.user.shopId,
        medicineId: { in: ids },
      },
      select: { medicineId: true },
    });

    if (blockedBatches.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'This medicine already exists in inventory and cannot be deleted.',
        },
        { status: 409 }
      );
    }

    const result = await prisma.medicine.updateMany({
      where: {
        shopId: authResult.user.shopId,
        id: { in: ids },
      },
      data: { isActive: false },
    });

    return NextResponse.json({
      success: true,
      count: result.count,
      message: 'Medicines deleted successfully',
    });
  } catch (error) {
    console.error('Bulk delete medicines error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to delete medicines' },
      { status: 500 }
    );
  }
}
