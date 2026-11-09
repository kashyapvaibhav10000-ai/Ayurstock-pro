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
    if (auth.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, message: 'ADMIN only' }, { status: 403 });
    }

    const body = await req.json();
    const { companyName, password } = body as { companyName: string; password?: unknown };

    if (!companyName || typeof companyName !== 'string' || companyName.trim() === '') {
      return NextResponse.json({ success: false, message: 'companyName is required' }, { status: 400 });
    }

    // Re-check the password here: the browser's own check can be skipped.
    if (!(await passwordConfirms(auth.user.id, password))) {
      return NextResponse.json({ success: false, message: 'Password is incorrect' }, { status: 403 });
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
    // One transaction: a failure part-way leaves nothing half-deleted.
    await prisma.$transaction(async (tx) => {
      await tx.stockLedger.deleteMany({ where: { shopId, medicine: { company } } });
      await tx.saleItem.deleteMany({ where: { medicine: { shopId, company } } });
      await tx.purchaseItem.deleteMany({ where: { medicine: { shopId, company } } });
      await tx.medicineReturn.deleteMany({ where: { shopId, medicine: { company } } });
      await tx.inventoryBatch.deleteMany({ where: { shopId, medicine: { company } } });
      await tx.medicine.deleteMany({ where: { shopId, company } });
      await tx.activityLog.create({
        data: { shopId, userId: auth.user!.id, action: 'CLEAR_BY_COMPANY', meta: JSON.stringify({ company, medicineCount }) },
      });
    }, { timeout: 60_000 });

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
