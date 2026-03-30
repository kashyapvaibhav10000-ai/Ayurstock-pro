import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import { CreatePurchaseSchema } from '@/lib/schemas';
import { getLowStockMedicines } from '@/services/inventory';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

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

    const { supplierId, invoiceNumber, invoiceDate, gstType, paymentType, status, notes, items } =
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
      let subtotal = 0;
      let discountTotal = 0;
      let gstTotal = 0;

      const itemPayloads: Array<{
        medicineId: string;
        batchId: string;
        quantity: number;
        freeQty: number;
        scheme?: string;
        purchaseRate: number;
        mrp: number;
        discount: number;
        gst: number;
        expiryDate: Date;
      }> = [];
      const ledgerPayloads: Array<{
        shopId: string;
        medicineId: string;
        batchId: string;
        type: string;
        qty: number;
        referenceId: string;
      }> = [];

      for (const item of items) {
        const qty = Number(item.quantity);
        const freeQty = Number(item.freeQty || 0);
        const purchaseRate = Number(item.purchaseRate);
        const mrp = Number(item.mrp);
        const lineDiscount = Number(item.discount || 0);
        const lineGst = Number(item.gst || 0);
        const lineSubtotal = qty * purchaseRate;

        subtotal += lineSubtotal;
        discountTotal += lineDiscount;
        gstTotal += lineGst;

        const existingBatch = await tx.inventoryBatch.findFirst({
          where: {
            shopId: shopId,
            medicineId: item.medicineId,
            batchNumber: item.batchNumber.trim(),
          },
        });

        let batchId = existingBatch?.id;

        if (existingBatch) {
          const updated = await tx.inventoryBatch.update({
            where: { id: existingBatch.id },
            data: {
              expiryDate: new Date(item.expiryDate),
              stockQty: { increment: qty + freeQty },
              purchaseRate,
              mrp,
              sellingRate: mrp,
              rackLocation: item.rackLocation?.trim() || existingBatch.rackLocation || null,
            },
          });
          batchId = updated.id;
        } else {
          const createdBatch = await tx.inventoryBatch.create({
            data: {
              shopId: shopId,
              medicineId: item.medicineId,
              batchNumber: item.batchNumber.trim(),
              expiryDate: new Date(item.expiryDate),
              stockQty: qty + freeQty,
              purchaseRate,
              mrp,
              sellingRate: mrp,
              rackLocation: item.rackLocation?.trim() || null,
            },
          });
          batchId = createdBatch.id;
        }

        itemPayloads.push({
          medicineId: item.medicineId,
          batchId: batchId!,
          quantity: qty,
          freeQty,
          scheme: item.scheme?.trim() || undefined,
          purchaseRate,
          mrp,
          discount: lineDiscount,
          gst: lineGst,
          expiryDate: new Date(item.expiryDate),
        });
      }

      const totalAmount = subtotal - discountTotal + gstTotal;

      const createdPurchase = await tx.purchase.create({
        data: {
          shopId: shopId,
          supplierId,
          invoiceNumber: invoiceNumber.trim(),
          invoiceDate: new Date(invoiceDate),
          gstType,
          paymentType,
          status,
          subtotal,
          discountTotal,
          gstTotal,
          totalAmount,
          notes: notes?.trim() || null,
          purchaseItems: {
            create: itemPayloads,
          },
        },
        include: {
          supplier: {
            select: {
              name: true,
            },
          },
          purchaseItems: true,
        },
      });

      for (const payload of itemPayloads) {
        const totalQty = payload.quantity + payload.freeQty;
        if (totalQty > 0) {
          ledgerPayloads.push({
            shopId: shopId,
            medicineId: payload.medicineId,
            batchId: payload.batchId,
            type: 'PURCHASE',
            qty: totalQty,
            referenceId: createdPurchase.id,
          });
        }
      }

      if (ledgerPayloads.length > 0) {
        await tx.stockLedger.createMany({ data: ledgerPayloads });
      }

      await tx.activityLog.create({
        data: {
          shopId: shopId,
          userId: userId,
          action: 'CREATE_PURCHASE',
          meta: JSON.stringify({
            purchaseId: createdPurchase.id,
            invoiceNumber: createdPurchase.invoiceNumber,
            supplierId,
            totalAmount,
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
