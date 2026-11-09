import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createErrorResponse, createApiResponse } from '@/middleware/auth';
import { normalizeExpiry } from '@/lib/batch';
import { findBatchByIdentity, findOrCreateBatch } from '@/services/inventory';
import { recordMovement } from '@/lib/stock-movement';

/** A rule the request broke; answered with 400 and this message. */
class ReturnError extends Error {}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    if (auth.user.role !== 'ADMIN' && auth.user.role !== 'MANAGER') {
      return createErrorResponse('Insufficient permissions', 403);
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';

    const returns = await prisma.medicineReturn.findMany({
      where: {
        shopId: auth.user.shopId,
        ...(search ? {
          OR: [
            { medicine: { name: { contains: search, mode: 'insensitive' } } },
            { batchNumber: { contains: search, mode: 'insensitive' } },
            { reason: { contains: search, mode: 'insensitive' } }
          ]
        } : {})
      },
      include: {
        medicine: true,
        createdBy: {
          select: { name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return createApiResponse(true, returns);

  } catch (error: any) {
    console.error('Returns Fetch Error:', error);
    return createErrorResponse('Failed to load returns', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    if (auth.user.role !== 'ADMIN' && auth.user.role !== 'MANAGER') {
      return createErrorResponse('Insufficient permissions', 403);
    }

    const body = await req.json().catch(() => null);
    const { 
      medicineId, 
      companyId, 
      batchNumber, 
      batchId,
      expiryDate, 
      mrp, 
      quantity, 
      reason, 
      notes, 
      type,
      saleItemId
    } = body ?? {};

    if (type !== 'CUSTOMER' && type !== 'SUPPLIER') {
      return createErrorResponse('Return type must be CUSTOMER or SUPPLIER', 400);
    }

    const q = Number(quantity);
    if (!Number.isInteger(q) || q <= 0) {
      return createErrorResponse('Quantity must be a whole number greater than 0', 400);
    }
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) {
      return createErrorResponse('Reason is required', 400);
    }

    // A customer return must point at the sale line it reverses: that caps
    // the quantity and fixes the refund price to what the customer paid.
    if (type === 'CUSTOMER' && !saleItemId) {
      return createErrorResponse('Customer returns must reference the original sale item.', 400);
    }
    if (type === 'SUPPLIER' && (!medicineId || !expiryDate || mrp === undefined)) {
      return createErrorResponse('Missing mandatory fields', 400);
    }

    let verifiedMedicineId: string = medicineId;
    let verifiedBatchId: string | undefined = batchId;
    let verifiedSaleId: string | undefined;
    let returnMrp = Number(mrp);
    let returnBatchNumber: string | undefined = batchNumber;
    let returnExpiryInput = expiryDate;

    if (saleItemId) {
      const saleItem = await prisma.saleItem.findFirst({
        where: { id: saleItemId, sale: { shopId: auth.user.shopId } },
        include: { batch: { select: { batchNumber: true, expiryDate: true } } },
      });
      if (!saleItem || (medicineId && saleItem.medicineId !== medicineId)) {
        return createErrorResponse('Invalid Sale Item provided.', 400);
      }
      verifiedMedicineId = saleItem.medicineId;
      verifiedBatchId = saleItem.batchId;
      verifiedSaleId = saleItem.saleId;
      returnMrp = Number(saleItem.mrp);
      returnBatchNumber = saleItem.batch.batchNumber;
      returnExpiryInput = saleItem.batch.expiryDate;
    }

    if (!Number.isFinite(returnMrp) || returnMrp < 0) {
      return createErrorResponse('Invalid MRP', 400);
    }

    // Security Check: Verify medicine belongs to current shop
    const medicine = await prisma.medicine.findFirst({
      where: { id: verifiedMedicineId, shopId: auth.user.shopId }
    });

    if (!medicine) {
      return createErrorResponse('Access Denied: Medicine does not belong to your shop.', 403);
    }

    const returnExpiry = normalizeExpiry(returnExpiryInput);

    // Only link a company of this shop; another shop's id (or a made-up one) is dropped.
    const ownCompany =
      typeof companyId === 'string' && companyId
        ? await prisma.company.findFirst({ where: { id: companyId, shopId: auth.user.shopId }, select: { id: true } })
        : null;

    // Execute the return registration and stock logic transactionally
    const result = await prisma.$transaction(async (tx) => {
      if (saleItemId) {
        // Lock the sale line so two concurrent returns cannot both pass the cap.
        await tx.$queryRaw`SELECT id FROM "SaleItem" WHERE id = ${saleItemId} FOR UPDATE`;
        const sold = await tx.saleItem.findUniqueOrThrow({ where: { id: saleItemId }, select: { quantity: true } });
        const returned = await tx.medicineReturn.aggregate({ where: { saleItemId }, _sum: { quantity: true } });
        const left = sold.quantity - (returned._sum.quantity ?? 0);
        if (q > left) {
          throw new ReturnError(`Maximum returnable quantity is ${Math.max(0, left)}.`);
        }
      }

      // 1. Log the return
      const medReturn = await tx.medicineReturn.create({
        data: {
          shopId: auth.user.shopId,
          medicineId: verifiedMedicineId,
          companyId: ownCompany?.id ?? null,
          batchNumber: returnBatchNumber || 'RETURN_BATCH',
          batchId: verifiedBatchId,
          expiryDate: returnExpiry,
          mrp: returnMrp,
          quantity: q,
          reason,
          notes: typeof notes === 'string' ? notes.slice(0, 1000) : null,
          type, // CUSTOMER or SUPPLIER
          status: 'PROCESSED',
          createdByUserId: auth.user.id,
          saleId: verifiedSaleId ?? null,
          saleItemId: saleItemId ?? null
        }
      });

      let stockQuantityAdjustment = 0;
      if (type === 'CUSTOMER') {
        stockQuantityAdjustment = q; // Add stock
      } else if (type === 'SUPPLIER') {
        stockQuantityAdjustment = -q; // Remove stock
      }

      // Priority: find by verifiedBatchId, fallback to batch identity
      // (medicine + batch number + expiry + MRP, any packing).
      let existingBatch;
      if (verifiedBatchId) {
        existingBatch = await tx.inventoryBatch.findFirst({
          where: { id: verifiedBatchId, shopId: auth.user.shopId, medicineId: verifiedMedicineId }
        });
        if (!existingBatch) {
          throw new ReturnError('Batch not found for this medicine.');
        }
      } else {
        existingBatch = await findBatchByIdentity(tx, {
          shopId: auth.user.shopId,
          medicineId: verifiedMedicineId,
          batchNumber: returnBatchNumber || 'RETURN_BATCH',
          expiryDate: returnExpiry,
          mrp: returnMrp,
        });
      }

      if (existingBatch) {
        if (existingBatch.stockQty + stockQuantityAdjustment < 0) {
          throw new ReturnError('Insufficient stock to execute Supplier Return of this batch magnitude.');
        }

        await recordMovement(tx, {
          shopId: auth.user.shopId,
          medicineId: verifiedMedicineId,
          batchId: existingBatch.id,
          type: 'RETURN',
          qtyChange: stockQuantityAdjustment,
          refType: 'MEDICINE_RETURN',
          refId: medReturn.id,
          note: `${type === 'SUPPLIER' ? 'Returned to supplier' : 'Customer return'}: ${reason}`,
          userId: auth.user.id,
        });

      } else {
        if (type === 'SUPPLIER') {
          throw new ReturnError('Cannot return to supplier: This batch physically does not exist in inventory.');
        }

        // Inherit the purchase rate from an existing batch of the same medicine so
        // that returned stock keeps a realistic cost basis. Falling back to 0 here
        // would understate COGS and inflate profit reports.
        const referenceBatch = await tx.inventoryBatch.findFirst({
          where: { shopId: auth.user.shopId, medicineId: verifiedMedicineId, purchaseRate: { not: null } },
          orderBy: { createdAt: 'desc' },
          select: { purchaseRate: true },
        });

        const { batch: newBatch } = await findOrCreateBatch(
          tx,
          {
            shopId: auth.user.shopId,
            medicineId: verifiedMedicineId,
            batchNumber: returnBatchNumber || 'RETURN_BATCH',
            expiryDate: returnExpiry,
            mrp: returnMrp,
          },
          {
            purchaseRate: referenceBatch?.purchaseRate ?? null,
            sellingRate: returnMrp,
          }
        );
        await recordMovement(tx, {
          shopId: auth.user.shopId,
          medicineId: verifiedMedicineId,
          batchId: newBatch.id,
          type: 'RETURN',
          qtyChange: stockQuantityAdjustment,
          refType: 'MEDICINE_RETURN',
          refId: medReturn.id,
          note: `${type === 'SUPPLIER' ? 'Returned to supplier' : 'Customer return'}: ${reason}`,
          userId: auth.user.id,
        });
      }

      await tx.activityLog.create({
        data: {
          shopId: auth.user.shopId,
          userId: auth.user.id,
          action: 'MEDICINE_RETURN',
          meta: JSON.stringify({
            returnId: medReturn.id,
            medicineName: medicine.name,
            quantity: q,
            type
          })
        }
      });

      return medReturn;
    });

    return createApiResponse(true, result);

  } catch (error: any) {
    if (error instanceof ReturnError) {
      return createErrorResponse(error.message, 400);
    }
    if (error instanceof Error && error.message.startsWith('Insufficient stock')) {
      return createErrorResponse(error.message, 400);
    }
    console.error('Returns Execution Error:', error);
    return createErrorResponse('Failed to process return', 500);
  }
}
