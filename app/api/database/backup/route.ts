import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createErrorResponse } from '@/middleware/auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || auth.user.role !== 'ADMIN') {
      return createErrorResponse('Unauthorized, Admin access required', 401);
    }

    const shopId = auth.user.shopId;

    // Export non-financial core data only
    const [medicines, inventoryBatches, suppliers, companies, rackLocations, customers] = await Promise.all([
      prisma.medicine.findMany({ where: { shopId } }),
      prisma.inventoryBatch.findMany({ where: { shopId } }),
      prisma.supplier.findMany({ where: { shopId } }),
      prisma.company.findMany({ where: { shopId } }),
      prisma.rackLocation.findMany({ where: { shopId } }),
      prisma.customer.findMany({ where: { shopId } }),
    ]);

    const backupData = {
      meta: {
        shopId,
        timestamp: new Date().toISOString(),
        version: '1.0',
        note: 'This backup contains only non-financial data (Medicines, Inventory, Suppliers, Rack Locations, Customers). Sales and financial records are excluded for data integrity.'
      },
      data: { medicines, inventoryBatches, suppliers, companies, rackLocations, customers }
    };

    return new NextResponse(JSON.stringify(backupData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="AyurStock_Backup_${new Date().toISOString().split('T')[0]}.json"`
      }
    });

  } catch (error: any) {
    console.error('Backup Error:', error);
    return createErrorResponse(error.message || 'Failed to generate backup', 500);
  }
}

