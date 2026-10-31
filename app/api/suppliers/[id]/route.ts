import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { supplierFields } from '@/lib/schemas';
import { verifyAuth } from '@/lib/auth';
import { staffOnlyResponse } from '@/middleware/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const notStaff = staffOnlyResponse(auth.user!.role);
    if (notStaff) return notStaff;

    const supplier = await prisma.supplier.findFirst({
      where: { id: id, shopId: auth.user.shopId },
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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user || !['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const data = supplierFields(await req.json().catch(() => null));
    if (!data) {
      return NextResponse.json({ success: false, message: 'Invalid supplier details' }, { status: 400 });
    }
    const existing = await prisma.supplier.findFirst({ where: { id, shopId: auth.user.shopId }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Supplier not found' }, { status: 404 });
    }
    const supplier = await prisma.supplier.update({
      where: { id: existing.id },
      data
    });

    return NextResponse.json({ success: true, data: supplier });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Failed to update supplier' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user || auth.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, message: 'ADMIN only' }, { status: 403 });
    }

    const existing = await prisma.supplier.findFirst({ where: { id, shopId: auth.user.shopId }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Supplier not found' }, { status: 404 });
    }
    await prisma.supplier.delete({
      where: { id: existing.id }
    });

    return NextResponse.json({ success: true, message: 'Supplier deleted' });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Failed to delete supplier' }, { status: 500 });
  }
}
