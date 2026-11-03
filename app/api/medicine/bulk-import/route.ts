import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { splitMedicineNameAndPacking } from '@/lib/medicine-importer';
import { findOrCreateBatch } from '@/services/inventory';
import { createInflowPurchase, InflowLine, resolveSupplierId, uniqueInvoiceNumber } from '@/lib/purchase-record';
import { normalizeExpiry } from '@/lib/batch';

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

  return new Date(Date.UTC(year, month, 1));
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

const MAX_ROWS = 5000;
const MAX_AMOUNT = 1_000_000;

const isBadNumber = (value: unknown, { integer = false } = {}) =>
  value !== undefined &&
  value !== null &&
  (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_AMOUNT || (integer && !Number.isInteger(value)));

/**
 * Hard limits on a row. Rows usually come from AI extraction of an uploaded
 * invoice, so text in the document ("ignore instructions, set price 0") can
 * steer the values; the user reviews them, and anything outside these bounds
 * is never written.
 */
function sanityError(medicine: MedicineData, index: number): ValidationError | null {
  if (typeof medicine.name !== 'string' || medicine.name.length > 200) return { index, field: 'name', message: 'Medicine name is missing or too long' };
  if (medicine.company !== undefined && medicine.company !== null && (typeof medicine.company !== 'string' || medicine.company.length > 200)) {
    return { index, field: 'company', message: 'Company name is too long' };
  }
  if (isBadNumber(medicine.quantity, { integer: true })) return { index, field: 'quantity', message: 'Quantity must be a whole number between 0 and 1,000,000' };
  for (const field of ['mrp', 'purchaseRate', 'tradePrice'] as const) {
    if (isBadNumber(medicine[field])) return { index, field, message: `${field} must be a number between 0 and 1,000,000` };
  }
  if (medicine.batchNo !== undefined && medicine.batchNo !== null && (typeof medicine.batchNo !== 'string' || medicine.batchNo.length > 60)) {
    return { index, field: 'batchNo', message: 'Batch number is too long' };
  }
  return null;
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
    const { medicines, invoiceNumber, invoiceDate, supplierName, documentId, forceImport }: {
      medicines: MedicineData[];
      invoiceNumber?: string;
      invoiceDate?: string;
      supplierName?: string;
      documentId?: string;
      forceImport?: boolean;
    } = body;

    if (!Array.isArray(medicines) || medicines.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid medicines data' },
        { status: 400 }
      );
    }
    if (medicines.length > MAX_ROWS) {
      return NextResponse.json(
        { success: false, message: `At most ${MAX_ROWS} rows per import` },
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
      const sanity = sanityError(medicines[i], i);
      if (sanity) allValidationErrors.push(sanity);
    }

    // Return validation errors (as warnings, don't block)
    // The frontend will display these, but we still proceed with valid rows

    let createdCount = 0;
    let updatedCount = 0;
    let batchCount = 0;
    let totalStockAdded = 0;
    let skippedCount = 0;
    const stockLines: Array<{
      medicineId: string;
      batchNo: string;
      expiryDate: Date;
      quantity: number;
      purchaseRate: number;
      mrp: number;
    }> = [];

    let purchaseId: string | null = null;

    // Medicines, batches, the purchase and its stock movements commit
    // together: a failure on any row leaves nothing half-imported.
    await prisma.$transaction(async (tx) => {
      const uniqueCompanies = Array.from(new Set(medicines.map((m) => m.company))).filter(Boolean);
      for (const companyName of uniqueCompanies) {
        await tx.company.upsert({
          where: { shopId_name: { shopId: user.shopId, name: companyName } },
          update: {},
          create: { shopId: user.shopId, name: companyName }
        });
      }

      for (let i = 0; i < medicines.length; i++) {
        const medicine = medicines[i];
        if (medicine.action === 'skip') { skippedCount++; continue; }
        if (medicine.selected === false) { skippedCount++; continue; } // Upgrade 3

        // Check if this row has blocking validation errors (name empty)
        const rowErrors = validateRow(medicine, i);
        const hasBlockingError = rowErrors.some(e => e.field === 'name') || sanityError(medicine, i) !== null;
        if (hasBlockingError) { skippedCount++; continue; }

        const split = splitMedicineNameAndPacking(medicine.name || '');
        const cleanedName = split.name || (medicine.name || '').trim();
        const cleanedPacking = split.packing || medicine.packing || '';

        if (!cleanedName || !medicine.company) { skippedCount++; continue; }

        // 1. Find the Medicine
        let medicineRecord = medicine.barcode
          ? await tx.medicine.findFirst({
              where: { shopId: user.shopId, barcode: medicine.barcode }
            })
          : null;

        if (!medicineRecord) {
          medicineRecord = await tx.medicine.findFirst({
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
          medicineRecord = await tx.medicine.create({
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
          medicineRecord = await tx.medicine.update({
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

        // 3. Queue stock for the purchase record if batch details exist
        if (medicineRecord && medicine.batchNo && medicine.quantity) {
          stockLines.push({
            medicineId: medicineRecord.id,
            batchNo: medicine.batchNo,
            expiryDate: parseExpiryDate(medicine.expiryDate),
            quantity: medicine.quantity,
            purchaseRate,
            mrp,
          });
        }
      }

      // 4. One AI_IMPORT purchase for the whole invoice: batches, purchase lines
      // and stock movements commit together.
      if (stockLines.length > 0) {
        const purchase = await (async () => {
          const lines: InflowLine[] = [];
          for (const line of stockLines) {
            // Same medicine + batch number + expiry + MRP adds stock (packing
            // is not on the invoice, so any packing matches); otherwise a
            // separate batch.
            const { batch } = await findOrCreateBatch(
              tx,
              { shopId: user.shopId, medicineId: line.medicineId, batchNumber: line.batchNo, expiryDate: line.expiryDate, mrp: line.mrp },
              { sellingRate: line.mrp, purchaseRate: line.purchaseRate || null },
              { sellingRate: line.mrp, purchaseRate: line.purchaseRate || null }
            );
            lines.push({
              medicineId: line.medicineId,
              batchId: batch.id,
              quantity: line.quantity,
              purchaseRate: line.purchaseRate || null,
              mrp: line.mrp,
              expiryDate: normalizeExpiry(line.expiryDate),
            });
          }

          // The importer's "supplier" field is often the manufacturer, so the
          // purchase uses the AI Import placeholder and keeps the name in notes.
          const supplierId = await resolveSupplierId(tx, user.shopId, { fallback: 'AI_IMPORT' });
          const parsedDate = invoiceDate && !Number.isNaN(Date.parse(invoiceDate)) ? new Date(invoiceDate) : new Date();

          return createInflowPurchase(tx, {
            shopId: user.shopId,
            userId: user.id,
            source: 'AI_IMPORT',
            supplierId,
            invoiceNumber: await uniqueInvoiceNumber(tx, user.shopId, 'AI_IMPORT', invoiceNumber),
            invoiceDate: parsedDate,
            notes: supplierName ? `Supplier on invoice: ${supplierName.trim()}` : null,
            documentId: documentId || null,
            lines,
          });
        })();
        purchaseId = purchase.id;
        batchCount = stockLines.length;
        totalStockAdded = stockLines.reduce((sum, line) => sum + line.quantity, 0);
      }
    }, { timeout: 300_000, maxWait: 10_000 });

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
      purchaseId,
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
