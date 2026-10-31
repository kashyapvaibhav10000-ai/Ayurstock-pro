import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { clientErrorMessage } from '@/lib/errors';
import { verifyAuth } from '@/lib/auth';
import { findOrCreateBatch } from '@/services/inventory';
import { createInflowPurchase, InflowLine, resolveSupplierId, uniqueInvoiceNumber } from '@/lib/purchase-record';

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
      const lines: InflowLine[] = [];

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
          lines.push({
            medicineId: item.medicineId,
            batchId: batch.id,
            quantity,
            purchaseRate: Number(item.purchaseRate) || null,
            mrp: Number(item.mrp),
            expiryDate: batch.expiryDate,
          });
        }

        createdCount += 1;
      }

      // Record the stock as one MANUAL purchase for this batch of items.
      if (lines.length > 0) {
        await createInflowPurchase(tx, {
          shopId: user.shopId,
          userId: user.id,
          source: 'MANUAL',
          supplierId: await resolveSupplierId(tx, user.shopId, { fallback: 'MANUAL' }),
          invoiceNumber: await uniqueInvoiceNumber(tx, user.shopId, 'MANUAL'),
          invoiceDate: new Date(),
          notes: 'Moved to inventory from medicine list',
          lines,
        });
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
        message: clientErrorMessage(error, 'Failed to move to inventory'),
      },
      { status: 500 }
    );
  }
}
