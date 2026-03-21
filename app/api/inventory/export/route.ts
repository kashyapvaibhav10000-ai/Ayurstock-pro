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

    // Export ALL inventory batches mapping relational constraints directly
    const batches = await prisma.inventoryBatch.findMany({
      where: {
        shopId: auth.user.shopId,
        stockQty: { gt: 0 } // Only active physical inventory
      },
      include: {
        medicine: true
      },
      orderBy: { // Critical sorting requirement: Nearest expiry appears first
        expiryDate: 'asc'
      }
    });

    const now = new Date();
    // Neutralize time to strictly evaluate days safely
    const timeNow = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

    const flatRecords = batches.map(b => {
      const expDate = new Date(b.expiryDate);
      const timeExp = Date.UTC(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());
      const deltaDays = Math.ceil((timeExp - timeNow) / (1000 * 60 * 60 * 24));

      // Color coding text override
      let expiryFlag = deltaDays.toString();
      if (deltaDays <= 0) expiryFlag = 'EXPIRED';
      else if (deltaDays <= 30) expiryFlag = 'EXPIRING SOON';

      return {
        'Medicine Name': b.medicine.name,
        'Company': b.medicine.company,
        'Category': b.medicine.category,
        'Batch Number': b.batchNumber,
        'Expiry Date': b.expiryDate.toISOString().split('T')[0],
        'Stock Quantity': b.stockQty,
        'Purchase Rate': b.purchaseRate.toFixed(2),
        'MRP': b.mrp.toFixed(2),
        'Rack Location': b.rackLocation,
        'Days Until Expiry': expiryFlag,
      };
    });

    // We rely back on PapaParse logic to cleanly wrap commas automatically instead of manual bounds checking!
    const csvContent = Papa.unparse(flatRecords);

    const filename = `inventory-report-${new Date().toISOString().split('T')[0]}.csv`;

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
