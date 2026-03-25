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
}

interface PreparedRow {
  shopId: string;
  name: string;
  company: string;
  category: string;
  barcode: string | null;
  hsn: string;
  packing: string;
  unit: string;
  isActive: boolean;
  action: 'create' | 'update' | 'skip';
}

const toKeyPart = (value: unknown) => String(value ?? '').toLowerCase();

function parseExpiryDate(dateStr?: string): Date {
  if (!dateStr) return new Date(new Date().setFullYear(new Date().getFullYear() + 2)); // Default 2 years expiry
  
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
    
    let yStr = parts[1];
    if (yStr.length === 2) {
      year = 2000 + parseInt(yStr);
    } else if (yStr.length === 4) {
      year = parseInt(yStr);
    }
  }
  
  return new Date(year, month, 1);
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

    const { medicines }: { medicines: MedicineData[] } = await req.json();

    if (!Array.isArray(medicines) || medicines.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid medicines data' },
        { status: 400 }
      );
    }

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

    for (const medicine of medicines) {
      if (medicine.action === 'skip') continue;

      const split = splitMedicineNameAndPacking(medicine.name || '');
      const cleanedName = split.name || (medicine.name || '').trim();
      const cleanedPacking = split.packing || medicine.packing || '';
      
      if (!cleanedName || !medicine.company) continue;

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

      // Requirement 1: purchaseRate from invoice PTS
      const purchaseRate = medicine.purchaseRate || medicine.tradePrice || 0;
      
      // Requirement 2: MRP logic (default to 1.2x if missing)
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

    // Requirement 4: Summary Message
    const summaryMessage = `${createdCount + updatedCount} medicines imported\n${batchCount} inventory batches created\nTotal stock added: ${totalStockAdded} units`;

    return NextResponse.json({
      success: true,
      count: createdCount,
      updated: updatedCount,
      batches: batchCount,
      totalStock: totalStockAdded,
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
