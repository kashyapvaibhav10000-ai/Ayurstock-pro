import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const shopId = auth.user.shopId;

    const medicines = await prisma.medicine.findMany({
      where: { shopId },
      orderBy: { name: 'asc' },
    });

    if (medicines.length === 0) {
      return NextResponse.json({ success: false, message: 'No medicines to export' }, { status: 404 });
    }

    // Create CSV header
    const headers = ['Name', 'Company', 'Category', 'Packing', 'HSN', 'Barcode', 'Unit', 'Created At'];
    const rows = medicines.map(m => [
      `"${(m.name || '').replace(/"/g, '""')}"`,
      `"${(m.company || '').replace(/"/g, '""')}"`,
      `"${(m.category || '').replace(/"/g, '""')}"`,
      `"${(m.packing || '').replace(/"/g, '""')}"`,
      `"${(m.hsn || '').replace(/"/g, '""')}"`,
      `"${(m.barcode || '').replace(/"/g, '""')}"`,
      `"${(m.unit || '').replace(/"/g, '""')}"`,
      m.createdAt.toISOString()
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

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
