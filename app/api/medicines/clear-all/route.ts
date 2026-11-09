import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { passwordConfirms } from '@/lib/user-guards';

export async function DELETE(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false }, { status: 401 });
    }
    
    // Only ADMIN can clear all medicines
    if (auth.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, message: 'ADMIN only' }, { status: 403 });
    }

    // Re-check the password here: the browser's own check can be skipped.
    const { password } = (await req.json().catch(() => null)) ?? {};
    if (!(await passwordConfirms(auth.user.id, password))) {
      return NextResponse.json({ success: false, message: 'Password is incorrect' }, { status: 403 });
    }

    const shopId = auth.user.shopId;
    const userId = auth.user.id;
    console.log('Clearing all medicines for shopId:', shopId);

    // One transaction: a failure part-way leaves nothing half-deleted.
    await prisma.$transaction(async (tx) => {
      // Delete in correct order to avoid foreign key errors across ALL relations
      // 1. Transaction items and ledgers (reference Medicine and InventoryBatch)
      await tx.stockLedger.deleteMany({ where: { shopId } });
      await tx.saleItem.deleteMany({ where: { medicine: { shopId } } });
      await tx.purchaseItem.deleteMany({ where: { medicine: { shopId } } });
      await tx.return.deleteMany({ where: { shopId } });
      await tx.medicineReturn.deleteMany({ where: { shopId } });

      // 2. Inventory batches (reference Medicine)
      await tx.inventoryBatch.deleteMany({ where: { shopId } });

      // 3. Medicines
      await tx.medicine.deleteMany({ where: { shopId } });

      // Clear AI/import jobs for THIS shop only (never wipe other tenants' jobs)
      await tx.importJob.deleteMany({ where: { shopId } });
      await tx.pdfImportJob.deleteMany({ where: { shopId } });

      await tx.activityLog.create({ data: { shopId, userId, action: 'CLEAR_ALL_MEDICINES', meta: '{}' } });
    }, { timeout: 60_000 });

    return NextResponse.json({ 
      success: true, 
      message: 'All medicines cleared successfully' 
    });
  } catch (error) {
    console.error('Error clearing medicines:', error);
    return NextResponse.json({ success: false, message: 'Failed to clear medicines' }, { status: 500 });
  }
}
