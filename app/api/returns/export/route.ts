import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/middleware/auth';
import Papa from 'papaparse';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Export ALL Returns mapping relational logic top-down
    const returns = await prisma.medicineReturn.findMany({
      where: { shopId: auth.user.shopId },
      include: {
        medicine: true,
        createdBy: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const flatRecords = returns.map((ret: any) => ({
      'Date': ret.createdAt.toISOString().split('T')[0],
      'Type': ret.type,
      'Medicine Name': ret.medicine ? ret.medicine.name : 'Unknown',
      'Batch Number': ret.batchNumber || '-',
      'Expiry Date': ret.expiryDate.toISOString().split('T')[0],
      'MRP': ret.mrp.toFixed(2),
      'Quantity': ret.quantity,
      'Reason': ret.reason,
      'Processed By': ret.createdBy?.name || 'Unknown',
      'Status': ret.status
    }));

    const csvContent = Papa.unparse(flatRecords);
    const filename = `returns-report-${new Date().toISOString().split('T')[0]}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    console.error('Export CSV Error:', error);
    return new NextResponse('Failed to generate export file', { status: 500 });
  }
}
