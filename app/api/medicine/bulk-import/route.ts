import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { splitMedicineNameAndPacking } from '@/lib/medicine-importer';

interface MedicineData {
  code?: string;
  name: string;
  company: string;
  category?: string;
  packing?: string;
  mrp?: number;
  tradePrice?: number;
  hsn?: string;
  barcode?: string;
  action?: 'create' | 'update' | 'skip';
  batchNo?: string;
  expiryDate?: string;
  quantity?: number;
  purchaseRate?: number;
  selected?: boolean;        // Upgrade 3: partial accept
  validationError?: string;  // Upgrade 2: validation error
}

interface ValidationError {
  index: number;
  field: string;
  message: string;
}

const toKeyPart = (value: unknown) => String(value ?? '').toLowerCase();

function parseExpiryDate(dateStr?: string): Date {
  if (!dateStr) return new Date(new Date().setFullYear(new Date().getFullYear() + 2));

  // Handle ISO format "YYYY-MM-DD" (from normalizeExpiryDate)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    return new Date(dateStr.trim());
  }

  // Try to parse "MMM-YY" or "MM-YY" or "MM/YY"
  const clean = dateStr.trim().replace(/[-\/]/g, ' ');
  const parts = clean.split(/\s+/);

  let month = new Date().getMonth();
  let year = new Date().getFullYear();

  if (parts.length >= 2) {
    const m = parts[0].toLowerCase();
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const mIdx = months.findIndex(name => m.startsWith(name));
    if (mIdx !== -1) month = mIdx;
    else if (!isNaN(parseInt(m))) month = parseInt(m) - 1;

    const yStr = parts[1];
    if (yStr.length === 2) {
      year = 2000 + parseInt(yStr);
    } else if (yStr.length === 4) {
      year = parseInt(yStr);
    }
  }

  return new Date(year, month, 1);
}

// ── Upgrade 2: Row-level validation ─────────────────────────────────────
function validateRow(medicine: MedicineData, index: number): ValidationError[] {
  const errors: ValidationError[] = [];

  // Name must not be empty
  if (!medicine.name || !medicine.name.trim()) {
    errors.push({ index, field: 'name', message: 'Medicine name is empty' });
  }

  // Quantity must be > 0
  if (medicine.quantity !== undefined && medicine.quantity !== null && medicine.quantity <= 0) {
    errors.push({ index, field: 'quantity', message: 'Quantity must be greater than 0' });
  }

  // MRP must be > 0
  if (medicine.mrp !== undefined && medicine.mrp !== null && medicine.mrp <= 0) {
    errors.push({ index, field: 'mrp', message: 'MRP must be greater than 0' });
  }

  // MRP must be >= purchaseRate (PTS)
  const purchaseRate = medicine.purchaseRate || medicine.tradePrice || 0;
  if (medicine.mrp && purchaseRate > 0 && medicine.mrp < purchaseRate) {
    errors.push({ index, field: 'mrp', message: `MRP (₹${medicine.mrp}) is less than purchase rate (₹${purchaseRate})` });
  }

  // Expiry must be a future date
  if (medicine.expiryDate) {
    const expiry = parseExpiryDate(medicine.expiryDate);
    if (expiry < new Date()) {
      errors.push({ index, field: 'expiryDate', message: 'Expiry date is in the past' });
    }
  }

  // BatchNo if provided must not be empty string
  if (medicine.batchNo !== undefined && medicine.batchNo !== null && typeof medicine.batchNo === 'string' && medicine.batchNo.trim() === '') {
    errors.push({ index, field: 'batchNo', message: 'Batch number cannot be empty' });
  }

  return errors;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const user = auth.user;

    if (!['ADMIN', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { medicines, invoiceNumber, supplierName, forceImport }: {
      medicines: MedicineData[];
      invoiceNumber?: string;
      supplierName?: string;
      forceImport?: boolean;
    } = body;

    if (!Array.isArray(medicines) || medicines.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid medicines data' },
        { status: 400 }
      );
    }

    // ── Upgrade 1: Duplicate Invoice Check ──────────────────────────────
    if (invoiceNumber && supplierName && !forceImport) {
      const existing = await prisma.importedInvoice.findUnique({
        where: {
          shopId_invoiceNumber_supplierName: {
            shopId: user.shopId,
            invoiceNumber: invoiceNumber.trim(),
            supplierName: supplierName.trim(),
          }
        }
      });

      if (existing) {
        return NextResponse.json({
          success: false,
          isDuplicate: true,
          message: `Invoice ${invoiceNumber} from ${supplierName} was already imported on ${existing.createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}. Do you want to import again?`,
          previousImport: {
            importedAt: existing.createdAt,
            medicineCount: existing.medicineCount,
            totalStock: existing.totalStock,
          }
        });
      }
    }

    // ── Upgrade 2: Row-level Validation ─────────────────────────────────
    const allValidationErrors: ValidationError[] = [];
    for (let i = 0; i < medicines.length; i++) {
      if (medicines[i].action === 'skip') continue;
      if (medicines[i].selected === false) continue; // Upgrade 3: skip unchecked rows
      const rowErrors = validateRow(medicines[i], i);
      allValidationErrors.push(...rowErrors);
    }

    // Return validation errors (as warnings, don't block)
    // The frontend will display these, but we still proceed with valid rows

    const uniqueCompanies = Array.from(new Set(medicines.map((m) => m.company))).filter(Boolean);
    for (const companyName of uniqueCompanies) {
      await prisma.company.upsert({
        where: { shopId_name: { shopId: user.shopId, name: companyName } },
        update: {},
        create: { shopId: user.shopId, name: companyName }
      });
    }

    let createdCount = 0;
    let updatedCount = 0;
    let batchCount = 0;
    let totalStockAdded = 0;
    let skippedCount = 0;

    for (let i = 0; i < medicines.length; i++) {
      const medicine = medicines[i];
      if (medicine.action === 'skip') { skippedCount++; continue; }
      if (medicine.selected === false) { skippedCount++; continue; } // Upgrade 3

      // Check if this row has blocking validation errors (name empty)
      const rowErrors = validateRow(medicine, i);
      const hasBlockingError = rowErrors.some(e => e.field === 'name');
      if (hasBlockingError) { skippedCount++; continue; }

      const split = splitMedicineNameAndPacking(medicine.name || '');
      const cleanedName = split.name || (medicine.name || '').trim();
      const cleanedPacking = split.packing || medicine.packing || '';

      if (!cleanedName || !medicine.company) { skippedCount++; continue; }

      // 1. Find the Medicine
      let medicineRecord = medicine.barcode
        ? await prisma.medicine.findFirst({
            where: { shopId: user.shopId, barcode: medicine.barcode }
          })
        : null;

      if (!medicineRecord) {
        medicineRecord = await prisma.medicine.findFirst({
          where: {
            shopId: user.shopId,
            name: cleanedName,
            company: medicine.company.trim(),
            packing: cleanedPacking || null,
          }
        });
      }

      // purchaseRate from invoice PTS
      const purchaseRate = medicine.purchaseRate || medicine.tradePrice || 0;

      // MRP logic (default to 1.2x if missing)
      let mrp = medicine.mrp || 0;
      if (mrp === 0 && purchaseRate > 0) {
        mrp = Number((purchaseRate * 1.2).toFixed(2));
      }

      // 2. Create or Update Medicine
      if (!medicineRecord) {
        medicineRecord = await prisma.medicine.create({
          data: {
            shopId: user.shopId,
            name: cleanedName,
            company: medicine.company.trim(),
            category: medicine.category || 'Other',
            hsn: medicine.hsn || '',
            packing: cleanedPacking || null,
            barcode: medicine.barcode || null,
            mrp: mrp as any,
            tradePrice: purchaseRate as any,
            unit: 'strip',
          }
        });
        createdCount++;
      } else {
        medicineRecord = await prisma.medicine.update({
          where: { id: medicineRecord.id },
          data: {
            category: medicine.category || medicineRecord.category,
            hsn: medicine.hsn || medicineRecord.hsn,
            packing: cleanedPacking || medicineRecord.packing,
            mrp: (mrp || medicineRecord.mrp) as any,
            tradePrice: (purchaseRate || medicineRecord.tradePrice) as any,
          }
        });
        updatedCount++;
      }

      // 3. Create Inventory Batch if batch details exist
      if (medicineRecord && medicine.batchNo && medicine.quantity) {
        const expiryDate = parseExpiryDate(medicine.expiryDate);

        await prisma.inventoryBatch.upsert({
          where: {
            shopId_medicineId_batchNumber: {
              shopId: user.shopId,
              medicineId: medicineRecord.id,
              batchNumber: medicine.batchNo.trim(),
            }
          },
          update: {
            stockQty: { increment: medicine.quantity },
            mrp: mrp as any,
            purchaseRate: (purchaseRate || null) as any,
            sellingRate: mrp as any,
            expiryDate: expiryDate,
          },
          create: {
            shopId: user.shopId,
            medicineId: medicineRecord.id,
            batchNumber: medicine.batchNo.trim(),
            expiryDate: expiryDate,
            stockQty: medicine.quantity,
            mrp: mrp as any,
            purchaseRate: (purchaseRate || null) as any,
            sellingRate: mrp as any,
          }
        });
        batchCount++;
        totalStockAdded += medicine.quantity;
      }
    }

    // ── Upgrade 1: Record the imported invoice ──────────────────────────
    if (invoiceNumber && supplierName) {
      try {
        await prisma.importedInvoice.upsert({
          where: {
            shopId_invoiceNumber_supplierName: {
              shopId: user.shopId,
              invoiceNumber: invoiceNumber.trim(),
              supplierName: supplierName.trim(),
            }
          },
          update: {
            medicineCount: createdCount + updatedCount,
            totalStock: totalStockAdded,
          },
          create: {
            shopId: user.shopId,
            invoiceNumber: invoiceNumber.trim(),
            supplierName: supplierName.trim(),
            medicineCount: createdCount + updatedCount,
            totalStock: totalStockAdded,
            importedByUserId: user.id,
          }
        });
      } catch (e) {
        console.warn('Failed to record imported invoice:', e);
      }
    }

    // Summary Message
    const summaryMessage = `${createdCount + updatedCount} medicines imported\n${batchCount} inventory batches created\nTotal stock added: ${totalStockAdded} units${skippedCount > 0 ? `\n${skippedCount} rows skipped` : ''}`;

    return NextResponse.json({
      success: true,
      count: createdCount,
      updated: updatedCount,
      batches: batchCount,
      totalStock: totalStockAdded,
      skipped: skippedCount,
      validationErrors: allValidationErrors.length > 0 ? allValidationErrors : undefined,
      message: summaryMessage,
    });
  } catch (error) {
    console.error('Bulk import error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to import medicines' },
      { status: 500 }
    );
  }
}
