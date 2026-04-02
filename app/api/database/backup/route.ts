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

    // Export ALL tables — full pharmacy backup
    const [
      medicines, inventoryBatches, suppliers, companies, rackLocations, customers,
      sales, saleItems, purchases, purchaseItems,
      returns, medicineReturns,
      shopSettings, invoiceSettings, billingSettings,
      stockLedgers,
    ] = await Promise.all([
      prisma.medicine.findMany({ where: { shopId } }),
      prisma.inventoryBatch.findMany({ where: { shopId } }),
      prisma.supplier.findMany({ where: { shopId } }),
      prisma.company.findMany({ where: { shopId } }),
      prisma.rackLocation.findMany({ where: { shopId } }),
      prisma.customer.findMany({ where: { shopId } }),
      prisma.sale.findMany({ where: { shopId }, include: { saleItems: true } }),
      prisma.saleItem.findMany({ where: { sale: { shopId } } }),
      prisma.purchase.findMany({ where: { shopId }, include: { purchaseItems: true } }),
      prisma.purchaseItem.findMany({ where: { purchase: { shopId } } }),
      prisma.return.findMany({ where: { shopId } }),
      prisma.medicineReturn.findMany({ where: { shopId } }),
      prisma.shopSettings.findUnique({ where: { shopId } }),
      prisma.invoiceSettings.findUnique({ where: { shopId } }),
      prisma.billingSettings.findUnique({ where: { shopId } }),
      prisma.stockLedger.findMany({ where: { shopId } }),
    ]);

    const backupData = {
      meta: {
        shopId,
        timestamp: new Date().toISOString(),
        backedUpAt: new Date().toISOString(),
        version: '2.0',
        note: 'Full backup including all tables: Medicines, Inventory, Suppliers, Sales, Purchases, Returns, Settings, and Stock Ledgers. Pharmacy transaction records included as required by law.',
      },
      data: {
        medicines,
        inventoryBatches,
        suppliers,
        companies,
        rackLocations,
        customers,
        sales,
        saleItems,
        purchases,
        purchaseItems,
        returns,
        medicineReturns,
        shopSettings: shopSettings ? [shopSettings] : [],
        invoiceSettings: invoiceSettings ? [invoiceSettings] : [],
        billingSettings: billingSettings ? [billingSettings] : [],
        stockLedgers,
      },
    };

    return new NextResponse(JSON.stringify(backupData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="AyurStock_Backup_${new Date().toISOString().split('T')[0]}.json"`,
      },
    });

  } catch (error: any) {
    console.error('Backup Error:', error);
    return createErrorResponse(error.message || 'Failed to generate backup', 500);
  }
}
