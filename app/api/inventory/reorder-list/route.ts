import { NextRequest } from 'next/server';
import { authenticateRequest, createApiResponse, createErrorResponse } from '@/middleware/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return createErrorResponse('Unauthorized', 401);

    const threshold = parseInt(request.nextUrl.searchParams.get('threshold') || '10');

    const allBatches = await prisma.inventoryBatch.findMany({
      where: {
        shopId: auth.user.shopId,
        deletedAt: null,
      },
      select: {
        stockQty: true,
        mrp: true,
        purchaseRate: true,
        medicine: {
          select: {
            id: true,
            name: true,
            company: true,
            category: true,
            packing: true,
            hsn: true,
            lowStockThreshold: true,
          },
        },
      },
      orderBy: [{ stockQty: 'asc' }, { medicine: { name: 'asc' } }],
    });

    const batches = allBatches.filter(b => b.stockQty <= b.medicine.lowStockThreshold);

    // Deduplicate by medicine, keep lowest stock batch
    const byMedicine = new Map<string, typeof batches[number]>();
    for (const batch of batches) {
      const existing = byMedicine.get(batch.medicine.id);
      if (!existing || batch.stockQty < existing.stockQty) {
        byMedicine.set(batch.medicine.id, batch);
      }
    }

    // Get supplier info by looking up purchases for each medicine's company
    const medicineIds = Array.from(byMedicine.keys());
    const purchases = medicineIds.length === 0 ? [] : await prisma.purchaseItem.findMany({
      where: {
        medicine: { id: { in: medicineIds }, shopId: auth.user.shopId },
      },
      select: {
        medicineId: true,
        purchase: {
          select: {
            supplier: { select: { id: true, name: true, phone: true, email: true } },
          },
        },
      },
      orderBy: { purchase: { createdAt: 'desc' } },
      distinct: ['medicineId'],
    });

    const supplierByMedicine = new Map(
      purchases.map((p) => [p.medicineId, p.purchase.supplier])
    );

    const result = Array.from(byMedicine.values()).map((batch) => ({
      medicineName: batch.medicine.name,
      company: batch.medicine.company,
      category: batch.medicine.category,
      packing: batch.medicine.packing,
      hsn: batch.medicine.hsn,
      currentStock: batch.stockQty,
      threshold: batch.medicine.lowStockThreshold,
      lastPurchaseRate: Number(batch.purchaseRate),
      mrp: Number(batch.mrp),
      supplier: supplierByMedicine.get(batch.medicine.id) ?? null,
    }));

    return createApiResponse(true, result);
  } catch {
    return createErrorResponse('Internal server error', 500);
  }
}
