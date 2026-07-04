import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createErrorResponse, createApiResponse } from '@/middleware/auth';

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
    return createErrorResponse(error.message, 500);
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

    const body = await req.json();
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
      saleId,
      saleItemId
    } = body;

    if (!medicineId || !expiryDate || mrp === undefined || !quantity || !reason || !type) {
      return createErrorResponse('Missing mandatory fields', 400);
    }

    const q = Number(quantity);
    if (isNaN(q) || q <= 0) {
      return createErrorResponse('Quantity must be greater than 0', 400);
    }

    // Security Check: Verify medicine belongs to current shop
    const medicine = await prisma.medicine.findFirst({
      where: { id: medicineId, shopId: auth.user.shopId }
    });

    if (!medicine) {
      return createErrorResponse('Access Denied: Medicine does not belong to your shop.', 403);
    }

    // Step 1: Handle SaleItem Validation if provided
    let verifiedBatchId = batchId;
    if (saleItemId) {
      const saleItem = await prisma.saleItem.findUnique({
        where: { id: saleItemId },
        include: { medicineReturns: true }
      });

      if (!saleItem || saleItem.medicineId !== medicineId) {
        return createErrorResponse('Invalid Sale Item provided.', 400);
      }

      const previouslyReturned = saleItem.medicineReturns.reduce((acc: number, curr: any) => acc + curr.quantity, 0);
      if (q + previouslyReturned > saleItem.quantity) {
        return createErrorResponse(`Maximum returnable quantity is ${saleItem.quantity - previouslyReturned}.`, 400);
      }
      
      // Use the exact batch from the sale item
      verifiedBatchId = saleItem.batchId;
    }

    // Execute the return registration and stock logic transactionally
    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Log the return
      const medReturn = await tx.medicineReturn.create({
        data: {
          shopId: auth.user.shopId,
          medicineId,
          companyId,
          batchNumber: batchNumber || 'RETURN_BATCH',
          batchId: verifiedBatchId,
          expiryDate: new Date(expiryDate),
          mrp: Number(mrp),
          quantity: q,
          reason,
          notes,
          type, // CUSTOMER or SUPPLIER
          status: 'PROCESSED',
          createdByUserId: auth.user.id,
          saleId,
          saleItemId
        }
      });

      let stockQuantityAdjustment = 0;
      if (type === 'CUSTOMER') {
        stockQuantityAdjustment = q; // Add stock
      } else if (type === 'SUPPLIER') {
        stockQuantityAdjustment = -q; // Remove stock
      }

      // Priority: Find by verifiedBatchId, fallback to batchNumber
      let existingBatch;
      if (verifiedBatchId) {
        existingBatch = await tx.inventoryBatch.findUnique({
          where: { id: verifiedBatchId }
        });
      } else {
        existingBatch = await tx.inventoryBatch.findFirst({
          where: {
            shopId: auth.user.shopId,
            medicineId,
            batchNumber: batchNumber || 'RETURN_BATCH',
            mrp: Number(mrp)
          }
        });
      }

      let assignedBatchId = '';

      if (existingBatch) {
        const newStock = existingBatch.stockQty + stockQuantityAdjustment;
        
        if (newStock < 0) {
          throw new Error('Insufficient stock to execute Supplier Return of this batch magnitude.');
        }

        const updatedBatch = await tx.inventoryBatch.update({
          where: { id: existingBatch.id },
          data: { stockQty: newStock }
        });
        assignedBatchId = updatedBatch.id;

      } else {
        if (type === 'SUPPLIER') {
          throw new Error('Cannot return to supplier: This batch physically does not exist in inventory.');
        }

        // Inherit the purchase rate from an existing batch of the same medicine so
        // that returned stock keeps a realistic cost basis. Falling back to 0 here
        // would understate COGS and inflate profit reports.
        const referenceBatch = await tx.inventoryBatch.findFirst({
          where: { shopId: auth.user.shopId, medicineId, purchaseRate: { not: null } },
          orderBy: { createdAt: 'desc' },
          select: { purchaseRate: true },
        });

        const newBatch = await tx.inventoryBatch.create({
          data: {
            shopId: auth.user.shopId,
            medicineId,
            batchNumber: batchNumber || 'RETURN_BATCH',
            expiryDate: new Date(expiryDate),
            stockQty: stockQuantityAdjustment,
            mrp: Number(mrp),
            purchaseRate: referenceBatch?.purchaseRate ?? null,
            sellingRate: Number(mrp)
          }
        });
        assignedBatchId = newBatch.id;
      }

      await tx.stockLedger.create({
        data: {
          shopId: auth.user.shopId,
          medicineId,
          batchId: assignedBatchId,
          type: type === 'CUSTOMER' ? 'RETURN_IN' : 'RETURN_OUT',
          qty: q,
          referenceId: medReturn.id
        }
      });

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
    console.error('Returns Execution Error:', error);
    return createErrorResponse(error.message, 500);
  }
}
