import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import { UpdateSupplierSchema } from '@/lib/schemas';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const supplier = await prisma.supplier.findFirst({
      where: {
        id: params.id,
        shopId: auth.user.shopId,
      },
      include: {
        purchases: {
          orderBy: { invoiceDate: 'desc' },
          take: 20,
        },
      },
    });

    if (!supplier) {
      return NextResponse.json(
        { success: false, message: 'Supplier not found' },
        { status: 404 }
      );
    }

    const outstandingBalance = supplier.purchases
      .filter((purchase) => purchase.status !== 'PAID')
      .reduce((sum, purchase) => sum + Number(purchase.totalAmount), 0);

    return NextResponse.json({
      success: true,
      data: {
        ...supplier,
        outstandingBalance,
        purchases: supplier.purchases.map((purchase) => ({
          ...purchase,
          totalAmount: Number(purchase.totalAmount),
        })),
      },
    });
  } catch (error) {
    console.error('Get supplier detail error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load supplier' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const validation = UpdateSupplierSchema.safeParse({ ...body, id: params.id });
    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: 'Invalid supplier data' },
        { status: 400 }
      );
    }

    const existing = await prisma.supplier.findFirst({
      where: {
        id: params.id,
        shopId: auth.user.shopId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: 'Supplier not found' },
        { status: 404 }
      );
    }

    const updated = await prisma.supplier.update({
      where: { id: existing.id },
      data: {
        name: validation.data.name.trim(),
        contactPerson: validation.data.contactPerson?.trim() || null,
        phone: validation.data.phone.trim(),
        email: validation.data.email?.trim() || '',
        address: validation.data.address.trim(),
        city: validation.data.city?.trim() || null,
        state: validation.data.state?.trim() || null,
        gstin: validation.data.gstin?.trim() || null,
      },
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'Supplier updated successfully',
    });
  } catch (error) {
    console.error('Update supplier error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update supplier' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const supplier = await prisma.supplier.findFirst({
      where: {
        id: params.id,
        shopId: auth.user.shopId,
      },
      select: {
        id: true,
        purchases: {
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!supplier) {
      return NextResponse.json(
        { success: false, message: 'Supplier not found' },
        { status: 404 }
      );
    }

    if (supplier.purchases.length > 0) {
      return NextResponse.json(
        { success: false, message: 'Cannot delete a supplier with purchase history' },
        { status: 409 }
      );
    }

    await prisma.supplier.delete({
      where: { id: supplier.id },
    });

    return NextResponse.json({
      success: true,
      message: 'Supplier deleted successfully',
    });
  } catch (error) {
    console.error('Delete supplier error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to delete supplier' },
      { status: 500 }
    );
  }
}
