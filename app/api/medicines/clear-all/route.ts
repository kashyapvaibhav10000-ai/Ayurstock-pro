import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

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

    const shopId = auth.user.shopId;
    console.log('Clearing all medicines for shopId:', shopId);

    // Delete in correct order to avoid foreign key errors across ALL relations
    // 1. Transaction items and ledgers (reference Medicine and InventoryBatch)
    await prisma.stockLedger.deleteMany({ where: { shopId } });
    await prisma.saleItem.deleteMany({ where: { medicine: { shopId } } });
    await prisma.purchaseItem.deleteMany({ where: { medicine: { shopId } } });
    await prisma.return.deleteMany({ where: { shopId } });
    await prisma.medicineReturn.deleteMany({ where: { shopId } });

    // 2. Inventory batches (reference Medicine)
    await prisma.inventoryBatch.deleteMany({ where: { shopId } });

    // 3. Medicines
    await prisma.medicine.deleteMany({ where: { shopId } });
    
    // Clear AI/import jobs for THIS shop only (never wipe other tenants' jobs)
    await prisma.importJob.deleteMany({ where: { shopId } });
    await prisma.pdfImportJob.deleteMany({ where: { shopId } });

    return NextResponse.json({ 
      success: true, 
      message: 'All medicines cleared successfully' 
    });
  } catch (error) {
    console.error('Error clearing medicines:', error);
    return NextResponse.json({ success: false, message: 'Failed to clear medicines' }, { status: 500 });
  }
}
