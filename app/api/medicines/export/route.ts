import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import { staffOnlyResponse } from '@/middleware/auth';
import { toCsv } from '@/lib/csv';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const notStaff = staffOnlyResponse(auth.user!.role);
    if (notStaff) return notStaff;

    const shopId = auth.user.shopId;

    const medicines = await prisma.medicine.findMany({
      where: { shopId },
      orderBy: { name: 'asc' },
    });

    if (medicines.length === 0) {
      return NextResponse.json({ success: false, message: 'No medicines to export' }, { status: 404 });
    }

    const csvContent = toCsv(
      medicines.map((m) => ({
        Name: m.name,
        Company: m.company,
        Category: m.category,
        Packing: m.packing,
        HSN: m.hsn,
        Barcode: m.barcode,
        Unit: m.unit,
        'Created At': m.createdAt.toISOString(),
      }))
    );

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename=ayurstock_medicines_${new Date().toISOString().split('T')[0]}.csv`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ success: false, message: 'Failed to export medicines' }, { status: 500 });
  }
}
