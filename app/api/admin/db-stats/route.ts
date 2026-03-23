import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    
    // Only ADMIN can view DB stats
    if (auth.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, message: 'ADMIN only' }, { status: 403 });
    }

    const shopId = auth.user.shopId;

    const [
      medicineCount,
      batchCount,
      saleCount,
      purchaseCount,
      supplierCount,
      customerCount,
      companyCount,
      activityLogCount
    ] = await Promise.all([
      prisma.medicine.count({ where: { shopId } }),
      prisma.inventoryBatch.count({ where: { shopId } }),
      prisma.sale.count({ where: { shopId } }),
      prisma.purchase.count({ where: { shopId } }),
      prisma.supplier.count({ where: { shopId } }),
      prisma.customer.count({ where: { shopId } }),
      prisma.company.count({ where: { shopId } }),
      prisma.activityLog.count({ where: { shopId } }),
    ]);

    return NextResponse.json({
      success: true,
      counts: {
        medicines: medicineCount,
        inventoryBatches: batchCount,
        sales: saleCount,
        purchases: purchaseCount,
        suppliers: supplierCount,
        customers: customerCount,
        companies: companyCount,
        activityLogs: activityLogCount
      }
    });
  } catch (error) {
    console.error('Error fetching DB stats:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch database statistics' }, { status: 500 });
  }
}
