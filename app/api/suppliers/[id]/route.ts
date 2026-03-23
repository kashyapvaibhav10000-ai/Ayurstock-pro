import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const supplier = await prisma.supplier.findFirst({
      where: { id: params.id, shopId: auth.user.shopId },
      include: {
        purchases: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!supplier) {
      return NextResponse.json({ success: false, message: 'Supplier not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: supplier });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Failed to fetch supplier' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user || !['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const data = await req.json();
    const supplier = await prisma.supplier.update({
      where: { id: params.id, shopId: auth.user.shopId },
      data
    });

    return NextResponse.json({ success: true, data: supplier });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Failed to update supplier' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user || auth.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, message: 'ADMIN only' }, { status: 403 });
    }

    await prisma.supplier.delete({
      where: { id: params.id, shopId: auth.user.shopId }
    });

    return NextResponse.json({ success: true, message: 'Supplier deleted' });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Failed to delete supplier' }, { status: 500 });
  }
}
