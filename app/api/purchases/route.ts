import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import { staffOnlyResponse } from '@/middleware/auth';
import { CreatePurchaseSchema } from '@/lib/schemas';
import { findOrCreateBatch, getLowStockMedicines } from '@/services/inventory';
import { createInflowPurchase, InflowLine } from '@/lib/purchase-record';
import { normalizeExpiry } from '@/lib/batch';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const notStaff = staffOnlyResponse(auth.user!.role);
    if (notStaff) return notStaff;

    const searchParams = req.nextUrl.searchParams;
    const view = searchParams.get('view');

    if (view === 'stats') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

      const [todayAggregate, monthAggregate, pendingInvoices, lowStockRows] = await Promise.all([
        prisma.purchase.aggregate({
          where: {
            shopId: auth.user.shopId,
            invoiceDate: { gte: todayStart },
          },
          _sum: { totalAmount: true },
        }),
        prisma.purchase.aggregate({
          where: {
            shopId: auth.user.shopId,
            invoiceDate: { gte: monthStart },
          },
          _sum: { totalAmount: true },
        }),
        prisma.purchase.count({
          where: {
            shopId: auth.user.shopId,
            status: { not: 'PAID' },
          },
        }),
        getLowStockMedicines(auth.user.shopId, 10),
      ]);

      return NextResponse.json({
        success: true,
        data: {
          todayPurchases: Number(todayAggregate._sum.totalAmount || 0),
          monthPurchases: Number(monthAggregate._sum.totalAmount || 0),
          pendingInvoices,
          lowStockMedicines: lowStockRows.length,
        },
      });
    }

    const supplierId = searchParams.get('supplierId') || undefined;
    const invoice = searchParams.get('invoice') || undefined;
    const status = searchParams.get('status') || undefined;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 200);

    const purchases = await prisma.purchase.findMany({
      where: {
        shopId: auth.user.shopId,
        ...(supplierId ? { supplierId } : {}),
        ...(invoice ? { invoiceNumber: { contains: invoice } } : {}),
        ...(status && status !== 'all' ? { status } : {}),
        ...(startDate || endDate
          ? {
              invoiceDate: {
                ...(startDate ? { gte: new Date(startDate) } : {}),
                ...(endDate ? { lte: new Date(endDate) } : {}),
              },
            }
          : {}),
      },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        purchaseItems: {
          include: {
            medicine: {
              select: {
                id: true,
                name: true,
                company: true,
              },
            },
            batch: {
              select: {
                id: true,
                batchNumber: true,
                expiryDate: true,
                rackLocation: true,
              },
            },
          },
        },
      },
      orderBy: { invoiceDate: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: purchases.map((purchase) => ({
        ...purchase,
        totalAmount: Number(purchase.totalAmount),
        subtotal: Number(purchase.subtotal),
        discountTotal: Number(purchase.discountTotal),
        gstTotal: Number(purchase.gstTotal),
        purchaseItems: purchase.purchaseItems.map((item) => ({
          ...item,
          purchaseRate: Number(item.purchaseRate),
          mrp: Number(item.mrp),
          discount: Number(item.discount),
          gst: Number(item.gst),
        })),
      })),
    });
  } catch (error) {
    console.error('Get purchases error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load purchases' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validation = CreatePurchaseSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: 'Invalid purchase data' },
        { status: 400 }
      );
    }

    const { supplierId, invoiceNumber, invoiceDate, gstType, paymentType, status, notes, documentId, items } =
      validation.data;

    const shopId = auth.user.shopId;
    const userId = auth.user.id;

    const supplier = await prisma.supplier.findFirst({
      where: {
        id: supplierId,
        shopId: auth.user.shopId,
      },
      select: { id: true },
    });

    if (!supplier) {
      return NextResponse.json(
        { success: false, message: 'Supplier not found' },
        { status: 404 }
      );
    }

    const medicineIds = items.map((item) => item.medicineId);
    const medicines = await prisma.medicine.findMany({
      where: {
        shopId: auth.user.shopId,
        id: { in: medicineIds },
        isActive: true,
      },
      select: { id: true },
    });

    if (medicines.length !== new Set(medicineIds).size) {
      return NextResponse.json(
        { success: false, message: 'One or more medicines were not found' },
        { status: 404 }
      );
    }

    const purchase = await prisma.$transaction(async (tx) => {
      const lines: InflowLine[] = [];

      for (const item of items) {
        // Invoice lines may be in packs; stock and the ledger are in base units.
        const unitsPerPack = item.unitsPerPack ?? 1;
        const qty = Number(item.quantity) * unitsPerPack;
        const freeQty = Number(item.freeQty || 0) * unitsPerPack;
        const pricePerPack = new Prisma.Decimal(item.pricePerPack ?? item.purchaseRate ?? 0);
        const purchaseRate = pricePerPack.dividedBy(unitsPerPack);
        const mrp = Number(item.mrp); // MRP is entered per base unit

        // Batch identity = medicine + batch number + expiry + MRP (+ packing,
        // which invoices don't carry, so any packing matches). Any difference
        // becomes a separate batch.
        const expiryDate = normalizeExpiry(item.expiryDate);
        const rackLocation = item.rackLocation?.trim() || null;
        const { batch } = await findOrCreateBatch(
          tx,
          { shopId, medicineId: item.medicineId, batchNumber: item.batchNumber, expiryDate, mrp },
          { sellingRate: mrp, purchaseRate, rackLocation },
          { purchaseRate, sellingRate: mrp, ...(rackLocation ? { rackLocation } : {}) }
        );

        lines.push({
          medicineId: item.medicineId,
          batchId: batch.id,
          quantity: qty,
          freeQty,
          scheme: item.scheme,
          purchaseRate,
          mrp,
          discount: Number(item.discount || 0),
          gst: Number(item.gst || 0),
          expiryDate,
          packType: item.packType ?? null,
          unitsPerPack,
          pricePerPack: unitsPerPack > 1 || (item.pricePerPack !== undefined && item.pricePerPack !== null) ? pricePerPack : null,
        });
      }

      const createdPurchase = await createInflowPurchase(tx, {
        shopId,
        userId,
        source: documentId ? 'AI_IMPORT' : 'INVOICE',
        supplierId,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate: new Date(invoiceDate),
        gstType,
        paymentType,
        status,
        notes,
        documentId,
        lines,
      });

      await tx.activityLog.create({
        data: {
          shopId: shopId,
          userId: userId,
          action: 'CREATE_PURCHASE',
          meta: JSON.stringify({
            purchaseId: createdPurchase.id,
            invoiceNumber: createdPurchase.invoiceNumber,
            supplierId,
            totalAmount: Number(createdPurchase.totalAmount),
          }),
        },
      });

      return createdPurchase;
    });

    return NextResponse.json({
      success: true,
      data: {
        ...purchase,
        totalAmount: Number(purchase.totalAmount),
        subtotal: Number(purchase.subtotal),
        discountTotal: Number(purchase.discountTotal),
        gstTotal: Number(purchase.gstTotal),
      },
      message: 'Purchase saved successfully',
    });
  } catch (error) {
    console.error('Create purchase error:', error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error && error.message.includes('Unique constraint')
            ? 'Invoice number already exists'
            : 'Failed to save purchase',
      },
      { status: 500 }
    );
  }
}
