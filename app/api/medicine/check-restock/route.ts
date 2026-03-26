import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

interface MedicineQuery {
  name: string;
  company: string;
  packing?: string;
}

interface RestockInfo {
  exists: boolean;
  medicineId?: string;
  currentStock: number;
  lastPurchasePrice: number | null;
  lastMrp: number | null;
  batchCount: number;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { medicines }: { medicines: MedicineQuery[] } = await req.json();

    if (!Array.isArray(medicines) || medicines.length === 0) {
      return NextResponse.json({ success: false, message: 'No medicines provided' }, { status: 400 });
    }

    const results: RestockInfo[] = [];

    for (const med of medicines) {
      if (!med.name || !med.company) {
        results.push({ exists: false, currentStock: 0, lastPurchasePrice: null, lastMrp: null, batchCount: 0 });
        continue;
      }

      // Find the medicine in the master
      const medicineRecord = await prisma.medicine.findFirst({
        where: {
          shopId: auth.user.shopId,
          name: { equals: med.name.trim(), mode: 'insensitive' },
          company: { equals: med.company.trim(), mode: 'insensitive' },
          ...(med.packing ? { packing: med.packing.trim() } : {}),
        },
        select: {
          id: true,
          mrp: true,
          tradePrice: true,
        }
      });

      if (!medicineRecord) {
        results.push({ exists: false, currentStock: 0, lastPurchasePrice: null, lastMrp: null, batchCount: 0 });
        continue;
      }

      // Sum up stock across all batches
      const batches = await prisma.inventoryBatch.aggregate({
        where: {
          shopId: auth.user.shopId,
          medicineId: medicineRecord.id,
          stockQty: { gt: 0 },
        },
        _sum: { stockQty: true },
        _count: true,
      });

      // Get the latest batch's purchase rate
      const latestBatch = await prisma.inventoryBatch.findFirst({
        where: {
          shopId: auth.user.shopId,
          medicineId: medicineRecord.id,
        },
        orderBy: { createdAt: 'desc' },
        select: { purchaseRate: true, mrp: true },
      });

      results.push({
        exists: true,
        medicineId: medicineRecord.id,
        currentStock: batches._sum.stockQty || 0,
        lastPurchasePrice: latestBatch?.purchaseRate ? Number(latestBatch.purchaseRate) : null,
        lastMrp: latestBatch?.mrp ? Number(latestBatch.mrp) : (medicineRecord.mrp ? Number(medicineRecord.mrp) : null),
        batchCount: batches._count || 0,
      });
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Check restock error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to check restock status' },
      { status: 500 }
    );
  }
}
