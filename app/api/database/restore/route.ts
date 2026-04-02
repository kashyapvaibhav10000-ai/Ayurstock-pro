import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createErrorResponse } from '@/middleware/auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || auth.user.role !== 'ADMIN') {
      return createErrorResponse('Unauthorized, Admin access required', 401);
    }

    const shopId = auth.user.shopId;
    const isDryRun = request.nextUrl.searchParams.get('dryRun') === 'true';

    const body = await request.json();

    // === Shop ID Validation ===
    if (body?.meta?.shopId && body.meta.shopId !== shopId) {
      return NextResponse.json({
        success: false,
        error: 'This backup belongs to a different shop. Restore aborted.'
      }, { status: 403 });
    }

    const version = body?.meta?.version || '1.0';
    const backedUpAt = body?.meta?.backedUpAt || body?.meta?.timestamp || null;

    // Extract all possible data tables
    const {
      medicines = [], inventoryBatches = [], suppliers = [], companies = [],
      rackLocations = [], customers = [],
      sales = [], saleItems = [], purchases = [], purchaseItems = [],
      returns = [], medicineReturns = [],
      shopSettings = [], invoiceSettings = [], billingSettings = [],
      stockLedgers = [],
    } = body?.data || {};

    const summary: Record<string, number> = {
      medicines: medicines.length,
      inventoryBatches: inventoryBatches.length,
      suppliers: suppliers.length,
      companies: companies.length,
      rackLocations: rackLocations.length,
      customers: customers.length,
      sales: sales.length,
      purchases: purchases.length,
      returns: returns.length,
      medicineReturns: medicineReturns.length,
      stockLedgers: stockLedgers.length,
    };

    // === Dry-Run Mode ===
    if (isDryRun) {
      const isValidMedicine = medicines.every((m: any) => m.name && m.company);
      if (!isValidMedicine && medicines.length > 0) {
        return NextResponse.json({
          success: false,
          error: 'Invalid backup file: some medicine records are missing required fields (name, company).'
        }, { status: 400 });
      }

      const warnings: string[] = [];
      if (version === '1.0') {
        warnings.push('This is a v1.0 backup. Sales, Purchases, Returns, and Settings data are NOT included in this older backup format.');
      }

      const totalRecords = Object.values(summary).reduce((a, b) => a + b, 0);

      return NextResponse.json({
        success: true,
        dryRun: true,
        version,
        backedUpAt,
        warnings,
        summary: {
          ...summary,
          message: `This will restore ${totalRecords} total records across ${Object.entries(summary).filter(([, v]) => v > 0).length} tables using safe UPSERT. No existing data will be deleted.`
        }
      });
    }

    // === Auto-Backup BEFORE restoring ===
    const existingData = await Promise.all([
      prisma.medicine.findMany({ where: { shopId } }),
      prisma.inventoryBatch.findMany({ where: { shopId } }),
      prisma.supplier.findMany({ where: { shopId } }),
      prisma.company.findMany({ where: { shopId } }),
      prisma.rackLocation.findMany({ where: { shopId } }),
      prisma.customer.findMany({ where: { shopId } }),
    ]);

    const autoBackup = {
      meta: { shopId, timestamp: new Date().toISOString(), version: '1.0', source: 'auto-backup-before-restore' },
      data: {
        medicines: existingData[0],
        inventoryBatches: existingData[1],
        suppliers: existingData[2],
        companies: existingData[3],
        rackLocations: existingData[4],
        customers: existingData[5],
      }
    };

    try {
      await prisma.activityLog.create({
        data: {
          shopId,
          action: 'DATABASE_RESTORE_AUTO_BACKUP',
          meta: JSON.stringify({ timestamp: autoBackup.meta.timestamp, recordCounts: summary }),
        }
      });
    } catch (logErr) {
      console.warn('Could not store auto-backup log:', logErr);
    }

    // === UPSERT Restore ===
    const errors: string[] = [];

    // Upsert companies
    for (const company of companies) {
      try {
        await prisma.company.upsert({
          where: { shopId_name: { shopId, name: company.name } },
          update: { description: company.description },
          create: { shopId, name: company.name, description: company.description },
        });
      } catch (e: any) {
        errors.push(`Company "${company.name}": ${e.message}`);
      }
    }

    // Upsert suppliers
    for (const supplier of suppliers) {
      try {
        await prisma.supplier.upsert({
          where: { shopId_name: { shopId, name: supplier.name } },
          update: {
            contactPerson: supplier.contactPerson,
            phone: supplier.phone,
            email: supplier.email,
            address: supplier.address,
            city: supplier.city,
            state: supplier.state,
            gstin: supplier.gstin,
          },
          create: {
            shopId,
            name: supplier.name,
            contactPerson: supplier.contactPerson,
            phone: supplier.phone || '',
            email: supplier.email || '',
            address: supplier.address || '',
            city: supplier.city,
            state: supplier.state,
            gstin: supplier.gstin,
          },
        });
      } catch (e: any) {
        errors.push(`Supplier "${supplier.name}": ${e.message}`);
      }
    }

    // Upsert rack locations
    for (const rack of rackLocations) {
      try {
        await prisma.rackLocation.upsert({
          where: { shopId_name: { shopId, name: rack.name } },
          update: { description: rack.description },
          create: { shopId, name: rack.name, description: rack.description },
        });
      } catch (e: any) {
        errors.push(`Rack "${rack.name}": ${e.message}`);
      }
    }

    // Upsert medicines
    let medicinesRestored = 0;
    for (const med of medicines) {
      try {
        const existing = await prisma.medicine.findFirst({
          where: { shopId, name: med.name, company: med.company, packing: med.packing || null }
        });
        if (existing) {
          await prisma.medicine.update({
            where: { id: existing.id },
            data: {
              category: med.category,
              hsn: med.hsn,
              barcode: med.barcode,
              unit: med.unit,
              mrp: med.mrp,
              tradePrice: med.tradePrice,
              lowStockThreshold: med.lowStockThreshold || 0,
              gstPercent: med.gstPercent || 0,
              isActive: med.isActive ?? true,
            },
          });
        } else {
          await prisma.medicine.create({
            data: {
              shopId,
              name: med.name,
              company: med.company,
              category: med.category || 'General',
              barcode: med.barcode,
              hsn: med.hsn || '',
              packing: med.packing,
              unit: med.unit || 'strip',
              mrp: med.mrp,
              tradePrice: med.tradePrice,
              lowStockThreshold: med.lowStockThreshold || 0,
              gstPercent: med.gstPercent || 0,
              isActive: med.isActive ?? true,
            },
          });
        }
        medicinesRestored++;
      } catch (e: any) {
        errors.push(`Medicine "${med.name}": ${e.message}`);
      }
    }

    // Upsert customers
    for (const customer of customers) {
      try {
        const existing = await prisma.customer.findFirst({
          where: { shopId, phone: customer.phone }
        });
        if (!existing) {
          await prisma.customer.create({
            data: { shopId, name: customer.name, phone: customer.phone, address: customer.address || '' },
          });
        }
      } catch (e: any) {
        errors.push(`Customer "${customer.name}": ${e.message}`);
      }
    }

    // v2.0: Upsert sales (by invoiceNumber)
    let salesRestored = 0;
    if (version === '2.0') {
      for (const sale of sales) {
        try {
          const existing = await prisma.sale.findFirst({
            where: { shopId, invoiceNumber: sale.invoiceNumber }
          });
          if (!existing) {
            const saleItemsData = sale.saleItems || saleItems.filter((si: any) => si.saleId === sale.id);
            await prisma.sale.create({
              data: {
                shopId,
                customerId: sale.customerId,
                saleType: sale.saleType || 'RETAIL',
                invoiceNumber: sale.invoiceNumber,
                subtotal: sale.subtotal,
                discountTotal: sale.discountTotal || 0,
                gstTotal: sale.gstTotal,
                grandTotal: sale.grandTotal,
                paymentMode: sale.paymentMode,
                creditDue: sale.creditDue,
                createdByUserId: sale.createdByUserId,
                createdAt: new Date(sale.createdAt),
                saleItems: {
                  create: saleItemsData.map((si: any) => ({
                    medicineId: si.medicineId,
                    batchId: si.batchId,
                    quantity: si.quantity,
                    mrp: si.mrp,
                    rate: si.rate,
                    discount: si.discount || 0,
                    gst: si.gst,
                    gstPercent: si.gstPercent || 0,
                    amount: si.amount,
                  })),
                },
              },
            });
            salesRestored++;
          }
        } catch (e: any) {
          errors.push(`Sale "${sale.invoiceNumber}": ${e.message}`);
        }
      }
    }

    const totalRestored = medicinesRestored + suppliers.length + rackLocations.length + salesRestored;

    return NextResponse.json({
      success: true,
      dryRun: false,
      version,
      restored: { ...summary, medicinesRestored, salesRestored },
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      message: `Restore complete (v${version}). ${medicinesRestored} medicines, ${suppliers.length} suppliers, ${rackLocations.length} rack locations${salesRestored > 0 ? `, ${salesRestored} sales` : ''} were restored safely using UPSERT.`
    });

  } catch (error: any) {
    console.error('Restore Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to restore backup' }, { status: 500 });
  }
}
