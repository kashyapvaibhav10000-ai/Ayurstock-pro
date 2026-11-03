import { NextRequest } from 'next/server';
import { authenticateRequest, createApiResponse, createErrorResponse, createPaginatedResponse } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import { findOrCreateBatch, getAvailableBatches, getLowStockMedicines, getNearExpiryMedicines } from '@/services/inventory';
import { CreateBatchSchema } from '@/lib/schemas';
import { Prisma } from '@prisma/client';
import { addToManualPurchaseOrCreate, resolveSupplierId } from '@/lib/purchase-record';

export async function GET(request: NextRequest) {
  try {
    // Authenticate
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    const searchParams = request.nextUrl.searchParams;
    const medicineId = searchParams.get('medicineId');
    const reportType = searchParams.get('report'); // 'low-stock', 'near-expiry'
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 5000);
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search')?.trim();
    const company = searchParams.get('company')?.trim();
    const tab = searchParams.get('tab'); // 'all' | 'lowStock' | 'expiring30' | 'expiring60' | 'expired'
    const includeStats = searchParams.get('includeStats') === 'true';

    // Low stock report
    if (reportType === 'low-stock') {
      const medicines = await getLowStockMedicines(auth.user.shopId, 10);
      return createPaginatedResponse(
        medicines,
        medicines.length,
        1,
        medicines.length
      );
    }

    // Near expiry report
    if (reportType === 'near-expiry') {
      const medicines = await getNearExpiryMedicines(auth.user.shopId, 30);
      return createPaginatedResponse(
        medicines,
        medicines.length,
        1,
        medicines.length
      );
    }

    // Get batches for a medicine
    if (medicineId) {
      const batches = await getAvailableBatches(auth.user.shopId, medicineId);
      return createPaginatedResponse(batches, batches.length, 1, batches.length);
    }

    // Get all batches for the shop (with optional server-side search/company/tab
    // filtering so the Inventory page no longer has to download every batch and
    // filter thousands of rows in the browser).
    const shopId = auth.user.shopId;
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    const baseWhere: any = { shopId, deletedAt: null };

    if (search) {
      baseWhere.OR = [
        { medicine: { name: { contains: search, mode: 'insensitive' } } },
        { medicine: { company: { contains: search, mode: 'insensitive' } } },
        { batchNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (company && company !== 'all') {
      baseWhere.medicine = {
        ...(baseWhere.medicine || {}),
        company: { equals: company, mode: 'insensitive' },
      };
    }

    // Tab-based filtering mirrors the stat cards on the Inventory page.
    if (tab === 'lowStock') {
      baseWhere.stockQty = { lte: 10 };
    } else if (tab === 'expiring30') {
      baseWhere.expiryDate = { gte: now, lte: in30Days };
    } else if (tab === 'expiring60') {
      baseWhere.expiryDate = { gte: now, lte: in60Days };
    } else if (tab === 'expired') {
      baseWhere.expiryDate = { lt: now };
    }

    const [batches, total] = await Promise.all([
      prisma.inventoryBatch.findMany({
        where: baseWhere,
        include: {
          medicine: {
            select: {
              name: true,
              company: true,
              category: true,
              hsn: true,
            },
          },
        },
        orderBy: [
          { medicine: { category: 'asc' } },
          { expiryDate: 'asc' }
        ],
        take: limit,
        skip: offset,
      }),
      prisma.inventoryBatch.count({ where: baseWhere }),
    ]);

    // Stat card counts are independent of the current search/company/tab
    // filters (they always reflect totals for the active - or archived -
    // batch set), so compute them with cheap COUNT queries instead of
    // loading every batch into memory.
    let stats: {
      total: number;
      lowStock: number;
      expiring30: number;
      expiring60: number;
      expired: number;
    } | undefined;

    if (includeStats) {
      const [statsTotal, statsLowStock, statsExpiring30, statsExpiring60, statsExpired] =
        await Promise.all([
          prisma.inventoryBatch.count({ where: { shopId, deletedAt: null } }),
          prisma.inventoryBatch.count({ where: { shopId, deletedAt: null, stockQty: { lte: 10 } } }),
          prisma.inventoryBatch.count({
            where: { shopId, deletedAt: null, expiryDate: { gte: now, lte: in30Days } },
          }),
          prisma.inventoryBatch.count({
            where: { shopId, deletedAt: null, expiryDate: { gte: now, lte: in60Days } },
          }),
          prisma.inventoryBatch.count({ where: { shopId, deletedAt: null, expiryDate: { lt: now } } }),
        ]);

      stats = {
        total: statsTotal,
        lowStock: statsLowStock,
        expiring30: statsExpiring30,
        expiring60: statsExpiring60,
        expired: statsExpired,
      };
    }

    return createApiResponse(true, {
      batches,
      total,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
      stats,
    });
  } catch (error) {
    console.error('Get inventory error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    // Only ADMIN and MANAGER can create batches
    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return createErrorResponse('Forbidden - Insufficient permissions', 403);
    }

    const body = await request.json();

    // Validate input
    const validation = CreateBatchSchema.safeParse(body);
    if (!validation.success) {
      const errs = validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      console.error('Validation failed:', errs);
      return createErrorResponse('Invalid batch data: ' + errs, 400);
    }

    const { medicineId, batchNumber, expiryDate, stockQty, mrp, purchaseRate, sellingRate, rackLocation, packing } =
      validation.data;

    // Verify medicine belongs to shop
    const medicine = await prisma.medicine.findUnique({
      where: { id: medicineId },
      select: { shopId: true },
    });

    if (!medicine || medicine.shopId !== auth.user.shopId) {
      return createErrorResponse('Medicine not found', 404);
    }

    // Update gstPercent if it was provided
    if (typeof validation.data.gstPercent === 'number') {
      await prisma.medicine.update({
        where: { id: medicineId },
        data: { gstPercent: validation.data.gstPercent }
      });
    }

    // Same medicine + batch number + expiry + MRP + packing adds to the
    // existing batch; any difference creates a new batch.
    const batch = await prisma.$transaction(async (tx) => {
      const { batch: target, created } = await findOrCreateBatch(
        tx,
        { shopId: auth.user.shopId, medicineId, batchNumber, expiryDate, mrp, packing },
        {
          purchaseRate,
          sellingRate,
          rackLocation: rackLocation?.trim() || null,
        }
      );
      if (stockQty > 0) {
        // Manual stock is a purchase too (source MANUAL); distributor and
        // invoice number are optional.
        const supplierId = await resolveSupplierId(tx, auth.user.shopId, {
          supplierId: validation.data.supplierId,
          fallback: 'MANUAL',
        });
        const rate = purchaseRate ?? null;
        const gstPercent = validation.data.gstPercent ?? 0;
        await addToManualPurchaseOrCreate(tx, {
          shopId: auth.user.shopId,
          userId: auth.user.id,
          supplierId,
          invoiceNumber: validation.data.invoiceNumber,
          invoiceDate: new Date(),
          notes: created ? 'New batch added manually' : 'Added to existing batch manually',
          lines: [
            {
              medicineId,
              batchId: target.id,
              quantity: stockQty,
              purchaseRate: rate,
              mrp,
              gst: rate ? new Prisma.Decimal(rate).times(stockQty).times(gstPercent).dividedBy(100).toDecimalPlaces(2) : 0,
              expiryDate: target.expiryDate,
            },
          ],
        });
      }

      await tx.activityLog.create({
        data: {
          shopId: auth.user.shopId,
          userId: auth.user.id,
          action: created ? 'CREATE_BATCH' : 'ADD_TO_BATCH',
          meta: JSON.stringify({
            batchId: target.id,
            batchNumber: target.batchNumber,
            quantity: stockQty,
          }),
        },
      });

      return tx.inventoryBatch.findUniqueOrThrow({ where: { id: target.id } });
    });

    return createApiResponse(true, batch, undefined, 201);
  } catch (error: any) {
    console.error('Create batch error details:', error?.message || error);
    if (error?.code === 'P2002') {
      return createErrorResponse('A batch with this number already exists for this medicine', 400);
    }
    return createErrorResponse(`Internal server error: ${error?.message || error}`, 500);
  }
}
