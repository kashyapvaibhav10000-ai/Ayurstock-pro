import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import { z } from 'zod';

const ArchiveBatchSchema = z.object({
  batchId: z.string().min(1, 'Batch ID is required'),
  reason: z.string().min(1, 'Reason is required').max(500),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const user = auth.user;

    if (!['ADMIN', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validation = ArchiveBatchSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: 'Invalid request', errors: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { batchId, reason } = validation.data;

    const result = await prisma.$transaction(async (tx) => {
      // Re-verify batch is valid for archiving (critical safety check)
      const batch = await tx.inventoryBatch.findFirst({
        where: {
          id: batchId,
          shopId: user.shopId, // Tenant isolation
          stockQty: 0, // Must still be zero
          deletedAt: null, // Not already archived
        },
        include: {
          medicine: {
            select: {
              id: true,
              name: true,
              company: true,
            },
          },
        },
      });

      if (!batch) {
        throw new Error('Batch not found, does not belong to your shop, or no longer has zero stock');
      }

      // Archive the batch (soft delete)
      const now = new Date();
      await tx.inventoryBatch.update({
        where: { id: batchId },
        data: { deletedAt: now },
      });

      // Create activity log entry
      const activityLog = await tx.activityLog.create({
        data: {
          shopId: user.shopId,
          userId: user.id,
          action: 'BATCH_ARCHIVE',
          meta: JSON.stringify({
            type: 'MANUAL_ARCHIVE',
            reason,
            batchId: batch.id,
            batchNumber: batch.batchNumber,
            medicineId: batch.medicine.id,
            medicineName: batch.medicine.name,
            medicineCompany: batch.medicine.company,
            expiryDate: batch.expiryDate,
            mrp: Number(batch.mrp),
            archivedAt: now,
          }),
        },
      });

      return {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        medicineName: batch.medicine.name,
        medicineCompany: batch.medicine.company,
        archivedAt: now,
        activityLogId: activityLog.id,
      };
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Batch archived successfully',
    });
  } catch (error) {
    console.error('Archive batch error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to archive batch',
      },
      { status: 500 }
    );
  }
}
