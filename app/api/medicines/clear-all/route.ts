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

    // Delete in correct order to avoid foreign key errors across ALL relations
    // Inventory and logs that map to medicine
    await prisma.stockLedger.deleteMany({ where: { shopId } });
    await prisma.inventoryBatch.deleteMany({ where: { shopId } });
    
    // Child items linked to Medicine
    await prisma.saleItem.deleteMany({ where: { medicine: { shopId } } });
    await prisma.purchaseItem.deleteMany({ where: { medicine: { shopId } } });
    await prisma.return.deleteMany({ where: { shopId } });
    await prisma.medicineReturn.deleteMany({ where: { shopId } });

    // Directly delete medicines
    await prisma.medicine.deleteMany({ where: { shopId } });
    
    // Clear generic AI jobs (ImportJob is globally scoped without shopId per schema)
    await prisma.importJob.deleteMany({});
    // Clear PDF batch jobs mapped by shopId
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
