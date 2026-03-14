import { prisma } from '@/lib/db';
import { Decimal } from '@prisma/client/runtime/library';
import { PaymentMode, SaleType } from '@/types';

/**
 * Billing Service - Handles sale/invoice creation and calculations
 */

export interface BillingItem {
  medicineId: string;
  batchId?: string | null;
  quantity: number;
  rate: number;
  discount: number;
  gstPercent: number;
}

export interface BillingCalculation {
  subtotal: Decimal;
  totalDiscount: Decimal;
  totalGst: Decimal;
  grandTotal: Decimal;
  items: {
    medicineId: string;
    batchId: string;
    quantity: number;
    rate: number;
    discount: number;
    gstPercent: number;
    gst: number;
    amount: Decimal;
  }[];
}

/**
 * Calculate billing totals for items
 */
export function calculateBilling(items: BillingItem[]): BillingCalculation {
  const calculatedItems = items.map((item) => {
    const itemSubtotal = new Decimal(item.quantity * item.rate);
    const itemDiscount = new Decimal(item.discount);
    const itemAfterDiscount = itemSubtotal.minus(itemDiscount);
    const itemGst = itemAfterDiscount.times(
      new Decimal(item.gstPercent).dividedBy(100)
    );
    const itemAmount = itemAfterDiscount.plus(itemGst);

    return {
      ...item,
      gst: Math.round(itemGst.toNumber() * 100) / 100,
      amount: itemAmount,
    };
  });

  const subtotal = calculatedItems.reduce(
    (sum, item) => sum.plus(new Decimal(item.quantity * item.rate)),
    new Decimal(0)
  );

  const totalDiscount = calculatedItems.reduce(
    (sum, item) => sum.plus(new Decimal(item.discount)),
    new Decimal(0)
  );

  const totalGst = calculatedItems.reduce(
    (sum, item) => sum.plus(new Decimal(item.gst)),
    new Decimal(0)
  );

  const grandTotal = subtotal.minus(totalDiscount).plus(totalGst);

  return {
    subtotal,
    totalDiscount,
    totalGst,
    grandTotal,
    items: calculatedItems,
  };
}

/**
 * Create a sale/invoice
 */
export async function createSale(params: {
  shopId: string;
  customerId?: string | null;
  saleType: SaleType;
  items: BillingItem[];
  paymentMode: PaymentMode;
  discountTotal?: number;
  creditDue?: number;
  createdByUserId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const shop = await tx.shop.findUnique({
      where: { id: params.shopId },
      select: { name: true, address: true, phone: true, email: true, gstin: true },
    });

    if (!shop) {
      throw new Error('Shop not found');
    }

    const shopSettings = await tx.shopSettings.findUnique({
      where: { shopId: params.shopId },
      select: {
        shopName: true,
        addressLine1: true,
        addressLine2: true,
        phone: true,
        email: true,
        gstin: true,
      },
    });

    const invoiceSettings = await tx.invoiceSettings.upsert({
      where: { shopId: params.shopId },
      update: {},
      create: {
        shopId: params.shopId,
        shopName: shopSettings?.shopName || shop.name || '',
        addressLine1: shopSettings?.addressLine1 || shop.address || '',
        addressLine2: shopSettings?.addressLine2 || null,
        phone: shopSettings?.phone || shop.phone || '',
        email: shopSettings?.email || shop.email || '',
        gstin: shopSettings?.gstin || shop.gstin || '',
        invoicePrefix: 'INV-',
        nextInvoiceNumber: 1,
        watermarkText: shopSettings?.shopName || shop.name || '',
        watermarkEnabled: true,
      },
    });

    const invoiceSequence = invoiceSettings.nextInvoiceNumber;
    const invoiceNumber = `${invoiceSettings.invoicePrefix}${String(invoiceSequence).padStart(3, '0')}`;

    await tx.invoiceSettings.update({
      where: { shopId: params.shopId },
      data: { nextInvoiceNumber: invoiceSequence + 1 },
    });

    const reservedQty = new Map<string, number>();
    const expandedItems: BillingItem[] = [];
    const now = new Date();

    for (const item of params.items) {
      const totalQty = item.quantity;
      let remaining = totalQty;

      if (item.batchId) {
        const preferredBatch = await tx.inventoryBatch.findFirst({
          where: {
            id: item.batchId,
            shopId: params.shopId,
          },
          select: {
            id: true,
            medicineId: true,
            stockQty: true,
          },
        });

        if (!preferredBatch) {
          throw new Error(`Batch not found: ${item.batchId}`);
        }

        if (preferredBatch.medicineId !== item.medicineId) {
          throw new Error(`Batch ${item.batchId} does not belong to medicine ${item.medicineId}`);
        }

        const alreadyReserved = reservedQty.get(preferredBatch.id) || 0;
        const available = preferredBatch.stockQty - alreadyReserved;
        if (available > 0) {
          const takeQty = Math.min(available, remaining);
          const proportionalDiscount =
            totalQty > 0 ? new Decimal(item.discount).times(takeQty).dividedBy(totalQty) : new Decimal(0);

          expandedItems.push({
            medicineId: item.medicineId,
            batchId: preferredBatch.id,
            quantity: takeQty,
            rate: item.rate,
            discount: Number(proportionalDiscount.toFixed(2)),
            gstPercent: item.gstPercent,
          });

          reservedQty.set(preferredBatch.id, alreadyReserved + takeQty);
          remaining -= takeQty;
        }
      }

      if (remaining > 0) {
        const otherBatches = await tx.inventoryBatch.findMany({
          where: {
            shopId: params.shopId,
            medicineId: item.medicineId,
            stockQty: { gt: 0 },
            expiryDate: { gt: now },
            ...(item.batchId ? { NOT: { id: item.batchId } } : {}),
          },
          select: {
            id: true,
            stockQty: true,
          },
          orderBy: [{ expiryDate: 'asc' }, { stockQty: 'desc' }],
        });

        for (const batch of otherBatches) {
          if (remaining <= 0) {
            break;
          }
          const alreadyReserved = reservedQty.get(batch.id) || 0;
          const available = batch.stockQty - alreadyReserved;
          if (available <= 0) {
            continue;
          }

          const takeQty = Math.min(available, remaining);
          const proportionalDiscount =
            totalQty > 0 ? new Decimal(item.discount).times(takeQty).dividedBy(totalQty) : new Decimal(0);

          expandedItems.push({
            medicineId: item.medicineId,
            batchId: batch.id,
            quantity: takeQty,
            rate: item.rate,
            discount: Number(proportionalDiscount.toFixed(2)),
            gstPercent: item.gstPercent,
          });

          reservedQty.set(batch.id, alreadyReserved + takeQty);
          remaining -= takeQty;
        }
      }

      if (remaining > 0) {
        const allocated = totalQty - remaining;
        throw new Error(
          `Insufficient stock for medicine ${item.medicineId}. Requested ${totalQty}, available ${allocated}`
        );
      }
    }

    const billing = calculateBilling(expandedItems);

    const batches = await tx.inventoryBatch.findMany({
      where: {
        id: { in: billing.items.map((item) => item.batchId) },
        shopId: params.shopId,
      },
      select: {
        id: true,
        medicineId: true,
        stockQty: true,
        mrp: true,
      },
    });

    const batchMap = new Map(batches.map((batch) => [batch.id, batch]));

    const sale = await tx.sale.create({
      data: {
        shopId: params.shopId,
        customerId: params.customerId,
        saleType: params.saleType,
        invoiceNumber,
        subtotal: billing.subtotal,
        discountTotal: new Decimal(params.discountTotal || 0),
        gstTotal: billing.totalGst,
        grandTotal: billing.grandTotal,
        paymentMode: params.paymentMode,
        creditDue: params.creditDue ? new Decimal(params.creditDue) : null,
        createdByUserId: params.createdByUserId,
        saleItems: {
          create: billing.items.map((item) => ({
            medicineId: item.medicineId,
            batchId: item.batchId,
            quantity: item.quantity,
            mrp: batchMap.get(item.batchId)?.mrp ?? new Decimal(0),
            rate: new Decimal(item.rate),
            discount: new Decimal(item.discount),
            gst: new Decimal(item.gst),
            amount: item.amount,
          })),
        },
      },
      include: {
        saleItems: {
          include: {
            medicine: true,
            batch: true,
          },
        },
      },
    });

    const ledgerEntries = billing.items.map((item) => ({
      shopId: params.shopId,
      medicineId: item.medicineId,
      batchId: item.batchId,
      type: 'SALE',
      qty: item.quantity,
      referenceId: sale.id,
    }));

    if (ledgerEntries.length > 0) {
      await tx.stockLedger.createMany({ data: ledgerEntries });
    }

    for (const [batchId, qty] of reservedQty.entries()) {
      await tx.inventoryBatch.update({
        where: { id: batchId },
        data: {
          stockQty: { decrement: qty },
        },
      });
    }

    return sale;
  });
}

/**
 * Get sale with all details
 */
export async function getSaleDetails(saleId: string) {
  return prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      saleItems: {
        include: {
          medicine: true,
          batch: true,
        },
      },
      customer: true,
      createdByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

/**
 * Get sales for a date range
 */
export async function getSalesByDateRange(
  shopId: string,
  startDate: Date,
  endDate: Date,
  limit: number = 100,
  offset: number = 0
) {
  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where: {
        shopId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
      include: {
        customer: true,
        saleItems: {
          include: {
            medicine: true,
          },
        },
      },
    }),
    prisma.sale.count({
      where: {
        shopId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    }),
  ]);

  return { sales, total };
}

/**
 * Get daily sales summary
 */
export async function getDailySalesSummary(
  shopId: string,
  startDate: Date,
  endDate: Date
) {
  const sales = await prisma.sale.findMany({
    where: {
      shopId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      createdAt: true,
      grandTotal: true,
    },
  });

  // Group by date
  const dailyStats: Record<string, { count: number; total: Decimal }> = {};

  sales.forEach((sale: any) => {
    const dateKey = sale.createdAt.toISOString().split('T')[0];
    if (!dailyStats[dateKey]) {
      dailyStats[dateKey] = { count: 0, total: new Decimal(0) };
    }
    dailyStats[dateKey].count += 1;
    dailyStats[dateKey].total = dailyStats[dateKey].total.plus(sale.grandTotal);
  });

  return Object.entries(dailyStats).map(([date, stats]) => ({
    date: new Date(date),
    totalSales: stats.count,
    totalAmount: stats.total,
    transactionCount: stats.count,
    avgTransactionValue: stats.total.dividedBy(stats.count),
  }));
}

/**
 * Get top selling medicines
 */
export async function getTopSellingMedicines(
  shopId: string,
  startDate: Date,
  endDate: Date,
  limit: number = 10
) {
  const result = await prisma.saleItem.groupBy({
    by: ['medicineId'],
    where: {
      sale: {
        shopId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    },
    _sum: {
      quantity: true,
      amount: true,
    },
    orderBy: {
      _sum: {
        quantity: 'desc',
      },
    },
    take: limit,
  });

  const medicines = await Promise.all(
    result.map(async (item: any) => {
      const medicine = await prisma.medicine.findUnique({
        where: { id: item.medicineId },
        select: { name: true, company: true },
      });
      return {
        medicineId: item.medicineId,
        name: medicine?.name || 'Unknown',
        company: medicine?.company || 'Unknown',
        totalQuantity: item._sum.quantity || 0,
        totalAmount: item._sum.amount || new Decimal(0),
      };
    })
  );

  return medicines;
}
