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
    const { id, name, company, category, barcode, packing, gstPercent } = body ?? {};

    if (!id || !name || !company || !category) {
      return NextResponse.json(
        { success: false, message: 'Missing required medicine fields' },
        { status: 400 }
      );
    }

    const existingMedicine = await prisma.medicine.findFirst({
      where: {
        id,
        shopId: authResult.user.shopId,
        isActive: true,
      },
      select: {
        id: true,
        barcode: true,
      },
    });

    if (!existingMedicine) {
      return NextResponse.json(
        { success: false, message: 'Medicine not found' },
        { status: 404 }
      );
    }

    const normalizedBarcode = typeof barcode === 'string' ? barcode.trim() : '';
    if (normalizedBarcode) {
      const duplicateBarcode = await prisma.medicine.findFirst({
        where: {
          shopId: authResult.user.shopId,
          barcode: normalizedBarcode,
          NOT: { id },
        },
        select: { id: true },
      });

      if (duplicateBarcode) {
        return NextResponse.json(
          { success: false, message: 'Barcode already exists for another medicine' },
          { status: 409 }
        );
      }
    }

    const updatedMedicine = await prisma.medicine.update({
      where: { id },
      data: {
        name: name.trim(),
        company: company.trim(),
        category: category.trim(),
        barcode: normalizedBarcode || null,
        packing: typeof packing === 'string' ? packing.trim() || null : undefined,
        gstPercent: typeof gstPercent === 'number' ? gstPercent : undefined,
      },
    });

    await prisma.company.upsert({
      where: {
        shopId_name: {
          shopId: authResult.user.shopId,
          name: company.trim(),
        },
      },
      update: {},
      create: {
        shopId: authResult.user.shopId,
        name: company.trim(),
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedMedicine,
      message: 'Medicine updated successfully',
    });
  } catch (error) {
    console.error('Medicine update error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update medicine' },
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

    const searchParams = req.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, message: 'Medicine id is required' },
        { status: 400 }
      );
    }

    const medicine = await prisma.medicine.findFirst({
      where: {
        id,
        shopId: authResult.user.shopId,
        isActive: true,
      },
      select: { id: true },
    });

    if (!medicine) {
      return NextResponse.json(
        { success: false, message: 'Medicine not found' },
        { status: 404 }
      );
    }

    await prisma.medicine.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      message: 'Medicine deleted successfully',
    });
  } catch (error) {
    console.error('Medicine delete error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to delete medicine' },
      { status: 500 }
    );
  }
}
