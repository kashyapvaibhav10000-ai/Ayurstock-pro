import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function DELETE(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false }, { status: 401 });
    }
    if (auth.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, message: 'ADMIN only' }, { status: 403 });
    }

    const body = await req.json();
    const { companyName } = body as { companyName: string };

    if (!companyName || typeof companyName !== 'string' || companyName.trim() === '') {
      return NextResponse.json({ success: false, message: 'companyName is required' }, { status: 400 });
    }

    const shopId = auth.user.shopId;
    const company = companyName.trim();

    // Count first so we can return how many were deleted
    const medicineCount = await prisma.medicine.count({
      where: { shopId, company },
    });

    if (medicineCount === 0) {
      return NextResponse.json({ success: false, message: 'No medicines found for this company' }, { status: 404 });
    }

    // Delete dependent records in order to avoid FK violations
    await prisma.stockLedger.deleteMany({ where: { shopId, medicine: { company } } });
    await prisma.saleItem.deleteMany({ where: { medicine: { shopId, company } } });
    await prisma.purchaseItem.deleteMany({ where: { medicine: { shopId, company } } });
    await prisma.medicineReturn.deleteMany({ where: { shopId, medicine: { company } } });
    await prisma.inventoryBatch.deleteMany({ where: { shopId, medicine: { company } } });
    await prisma.medicine.deleteMany({ where: { shopId, company } });

    return NextResponse.json({
      success: true,
      deletedCount: medicineCount,
      message: `Deleted ${medicineCount} medicines from ${company}`,
    });
  } catch (error) {
    console.error('Error deleting medicines by company:', error);
    return NextResponse.json({ success: false, message: 'Failed to delete medicines' }, { status: 500 });
  }
}
