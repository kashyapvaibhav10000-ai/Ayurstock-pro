import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import { findOrCreateBatch } from '@/services/inventory';
import { recordMovement } from '@/lib/stock-movement';

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
        const medicine = await tx.medicine.findFirst({
          where: { id: item.medicineId, shopId: user.shopId },
          select: { id: true },
        });
        if (!medicine) {
          throw new Error('Medicine not found');
        }

        const quantity = Number(item.quantity);
        if (!item.batchNumber || !item.expiryDate || !Number.isInteger(quantity) || quantity < 0) {
          throw new Error('Each item needs batch number, expiry and a whole-number quantity');
        }

        // Same medicine + batch number + expiry adds to the existing batch.
        const { batch } = await findOrCreateBatch(
          tx,
          {
            shopId: user.shopId,
            medicineId: item.medicineId,
            batchNumber: String(item.batchNumber),
            expiryDate: item.expiryDate,
          },
          {
            mrp: Number(item.mrp),
            purchaseRate: Number(item.purchaseRate) || null,
            sellingRate: Number(item.mrp),
            packing:
              typeof item.packing === 'string' && item.packing.trim()
                ? item.packing.trim()
                : null,
            rackLocation:
              typeof item.rackLocation === 'string' && item.rackLocation.trim()
                ? item.rackLocation.trim()
                : null,
          }
        );
        if (quantity > 0) {
          await recordMovement(tx, {
            shopId: user.shopId,
            batchId: batch.id,
            type: 'MANUAL_ADD',
            qtyChange: quantity,
            note: 'Moved to inventory from medicine list',
            userId: user.id,
          });
        }

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
