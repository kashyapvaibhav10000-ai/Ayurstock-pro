import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const authResult = await verifyAuth(req);
    if (!authResult.authenticated) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = authResult.user!;

    // Check authorization
    if (!['ADMIN', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const {
      name,
      company,
      category,
      barcode,
      hsn,
      packing,
      mrp,
      tradePrice,
    }: {
      name: string;
      company: string;
      category?: string;
      barcode?: string;
      hsn?: string;
      packing?: string;
      mrp?: number;
      tradePrice?: number;
    } = await req.json();

    if (!name || !company) {
      return NextResponse.json(
        { success: false, message: 'Name and company are required' },
        { status: 400 }
      );
    }

    const normalized = {
      name: name.trim(),
      company: company.trim(),
      category: (category || 'Other').trim(),
      barcode: (barcode || '').trim() || null,
      hsn: (hsn || '').trim(),
      packing: (packing || '').trim() || null,
      mrp: typeof mrp === 'number' && Number.isFinite(mrp) ? mrp : undefined,
      tradePrice: typeof tradePrice === 'number' && Number.isFinite(tradePrice) ? tradePrice : undefined,
    };

    // First ensure company exists
    await prisma.company.upsert({
      where: {
        shopId_name: {
          shopId: user.shopId,
          name: normalized.company,
        },
      },
      update: {},
      create: {
        shopId: user.shopId,
        name: normalized.company,
      },
    });

    // Check for existing medicine by barcode first, then by name+company
    let existingMedicine = null;

    if (normalized.barcode) {
      existingMedicine = await prisma.medicine.findFirst({
        where: {
          shopId: user.shopId,
          barcode: normalized.barcode,
        },
      });
    }

    if (!existingMedicine) {
      existingMedicine = await prisma.medicine.findFirst({
        where: {
          shopId: user.shopId,
          name: normalized.name,
          company: normalized.company,
        },
      });
    }

    let result;
    if (!existingMedicine) {
      // Create new medicine
      result = await prisma.medicine.create({
        data: {
          shopId: user.shopId,
          name: normalized.name,
          company: normalized.company,
          category: normalized.category,
          barcode: normalized.barcode,
          hsn: normalized.hsn,
          packing: normalized.packing,
          unit: 'strip',
          isActive: true,
        },
      });
      return NextResponse.json({
        success: true,
        data: { id: result.id, action: 'created' },
        message: 'Medicine created successfully',
      });
    } else {
      // Update existing medicine if new data is available
      const shouldUpdate =
        (!existingMedicine.category && normalized.category) ||
        (!existingMedicine.hsn && normalized.hsn) ||
        (!existingMedicine.barcode && normalized.barcode) ||
        (!existingMedicine.packing && normalized.packing);

      if (shouldUpdate) {
        result = await prisma.medicine.update({
          where: { id: existingMedicine.id },
          data: {
            category: existingMedicine.category || normalized.category,
            hsn: existingMedicine.hsn || normalized.hsn,
            barcode: existingMedicine.barcode || normalized.barcode,
            packing: existingMedicine.packing || normalized.packing,
          },
        });
        return NextResponse.json({
          success: true,
          data: { id: result.id, action: 'updated' },
          message: 'Medicine updated successfully',
        });
      } else {
        return NextResponse.json({
          success: true,
          data: { id: existingMedicine.id, action: 'skipped' },
          message: 'Medicine already exists, no changes needed',
        });
      }
    }
  } catch (error) {
    console.error('Single import error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to import medicine',
      },
      { status: 500 }
    );
  }
}