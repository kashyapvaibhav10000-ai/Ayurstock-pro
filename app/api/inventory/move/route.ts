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

    const { items } = await req.json();

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No items provided' },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      let createdCount = 0;

      for (const item of items) {
        await tx.inventoryBatch.create({
          data: {
            shopId: user.shopId,
            medicineId: item.medicineId,
            batchNumber: item.batchNumber,
            expiryDate: new Date(item.expiryDate),
            stockQty: item.quantity,
            mrp: item.mrp,
            purchaseRate: item.purchaseRate,
            sellingRate: item.mrp,
            rackLocation:
              typeof item.rackLocation === 'string' && item.rackLocation.trim()
                ? item.rackLocation.trim()
                : null,
          },
        });

        createdCount += 1;
      }

      return { createdCount };
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `Added ${result.createdCount} items to inventory`,
    });
  } catch (error) {
    console.error('Inventory move error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to move to inventory',
      },
      { status: 500 }
    );
  }
}
