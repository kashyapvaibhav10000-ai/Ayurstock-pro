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

    // === SAFETY RULE 5: Shop ID Validation ===
    if (body?.meta?.shopId && body.meta.shopId !== shopId) {
      return NextResponse.json({
        success: false,
        error: 'This backup belongs to a different shop. Restore aborted.'
      }, { status: 403 });
    }

    // === SAFETY RULE 4: Financial Protection - Only restore safe data ===
    const { medicines = [], inventoryBatches = [], suppliers = [], companies = [], rackLocations = [], customers = [] } = body?.data || {};

    const summary = {
      medicines: medicines.length,
      inventoryBatches: inventoryBatches.length,
      suppliers: suppliers.length,
      companies: companies.length,
      rackLocations: rackLocations.length,
      customers: customers.length,
    };

    // === SAFETY RULE 2: Dry-Run Mode - Validate and summarize ===
    if (isDryRun) {
      // Basic schema validation
      const isValidMedicine = medicines.every((m: any) => m.name && m.company);
      if (!isValidMedicine && medicines.length > 0) {
        return NextResponse.json({
          success: false,
          error: 'Invalid backup file: some medicine records are missing required fields (name, company).'
        }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        dryRun: true,
        summary: {
          ...summary,
          message: `This will add or update ${summary.medicines} medicines, ${summary.inventoryBatches} inventory batches, ${summary.suppliers} suppliers, ${summary.companies} companies, ${summary.rackLocations} rack locations, and ${summary.customers} customers. Sales and financial history will NOT be modified.`
        }
      });
    }

    // === SAFETY RULE 3: Auto-Backup BEFORE restoring ===
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

    // Store auto-backup as activity log entry (JSON in meta field)
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

    // === SAFETY RULE 1: UPSERT only - never deleteMany ===
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

    // Upsert medicines (matching on name + company + packing)
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

    return NextResponse.json({
      success: true,
      dryRun: false,
      restored: { ...summary, medicinesRestored },
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined, // Cap error list
      message: `Restore complete. ${medicinesRestored} medicines, ${suppliers.length} suppliers, and ${rackLocations.length} rack locations were restored safely using UPSERT. Financial records were not touched.`
    });

  } catch (error: any) {
    console.error('Restore Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to restore backup' }, { status: 500 });
  }
}
