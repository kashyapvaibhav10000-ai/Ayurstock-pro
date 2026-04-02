import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const authResult = await verifyAuth(req);
    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const archivedMedicines = await prisma.medicine.findMany({
      where: {
        shopId: authResult.user.shopId,
        deletedAt: { not: null },
      },
      orderBy: { deletedAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: archivedMedicines,
    });
  } catch (error) {
    console.error('Fetch archived medicines error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch archived medicines' },
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
        { success: false, message: 'Medicine ID is required' },
        { status: 400 }
      );
    }

    await prisma.medicine.update({
      where: { id, shopId: authResult.user.shopId },
      data: { isActive: true, deletedAt: null },
    });

    return NextResponse.json({
      success: true,
      message: 'Medicine restored successfully',
    });
  } catch (error) {
    console.error('Restore medicine error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to restore medicine' },
      { status: 500 }
    );
  }
}
