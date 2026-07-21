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

function resolvePositiveRate(
  requestedRate: number,
  batch: { sellingRate: Decimal; mrp: Decimal; purchaseRate?: Decimal | null },
  saleType: SaleType
) {
  if (requestedRate > 0) {
    return requestedRate;
  }

  const purchaseRate = Number(batch.purchaseRate || 0);
  const sellingRate = Number(batch.sellingRate || 0);
  const mrp = Number(batch.mrp || 0);

  if ((saleType === 'WHOLESALE' || saleType === 'TRANSFER') && purchaseRate > 0) {
    return purchaseRate;
  }

  return sellingRate > 0 ? sellingRate : mrp;
}

export type GstMode = 'inclusive' | 'exclusive';

/**
 * Calculate billing totals for items.
 *
 * - inclusive: the item rate already contains GST. GST is extracted out of the
 *   discounted price and the amount equals the discounted (inclusive) price.
 * - exclusive: the item rate is pre-tax. GST is added on top of the discounted
 *   price and the amount equals discounted price + GST.
 *
 * The mode must match what the POS screen used so stored totals equal what the
 * cashier saw.
 */
export function calculateBilling(
  items: BillingItem[],
  gstMode: GstMode = 'inclusive'
): BillingCalculation {
  const calculatedItems = items.map((item) => {
    const lineTotal = new Decimal(item.quantity * item.rate);
    const itemDiscount = new Decimal(item.discount);
    const itemAfterDiscount = lineTotal.minus(itemDiscount);

    let itemGst: Decimal;
    let itemAmount: Decimal;

    if (gstMode === 'exclusive') {
      // GST is added on top of the (pre-tax) discounted price.
      const gstFactor = new Decimal(item.gstPercent).dividedBy(100);
      itemGst = itemAfterDiscount.times(gstFactor);
      itemAmount = itemAfterDiscount.plus(itemGst);
    } else {
      // Extract GST from the inclusive price: Price * GST% / (100 + GST%)
      const gstFactor = new Decimal(item.gstPercent).dividedBy(new Decimal(100).plus(item.gstPercent));
      itemGst = itemAfterDiscount.times(gstFactor);
      itemAmount = itemAfterDiscount; // Already inclusive
    }

    return {
      ...item,
      batchId: item.batchId || '',
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

  // Inclusive: amount already contains tax, so grand total = subtotal - discount.
  // Exclusive: tax sits on top, so grand total = subtotal - discount + gst.
  const grandTotal =
    gstMode === 'exclusive'
      ? subtotal.minus(totalDiscount).plus(totalGst)
      : subtotal.minus(totalDiscount);

  return {
    subtotal,
    totalDiscount,
    totalGst,
    grandTotal,
    items: calculatedItems as any,
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
  gstMode?: GstMode;
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

    // Atomically reserve the next invoice number. Using `increment` issues a
    // single UPDATE that row-locks the settings row, so two concurrent sales
    // cannot read the same sequence and produce duplicate invoice numbers.
    const bumped = await tx.invoiceSettings.update({
      where: { shopId: params.shopId },
      data: { nextInvoiceNumber: { increment: 1 } },
      select: { nextInvoiceNumber: true, invoicePrefix: true },
    });

    const invoiceSequence = bumped.nextInvoiceNumber - 1;
    const invoiceNumber = `${bumped.invoicePrefix}${String(invoiceSequence).padStart(3, '0')}`;

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
            deletedAt: null,
          },
          select: {
            id: true,
            medicineId: true,
            stockQty: true,
            mrp: true,
            purchaseRate: true,
            sellingRate: true,
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
            rate: resolvePositiveRate(item.rate, preferredBatch, params.saleType),
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
            deletedAt: null,
            ...(item.batchId ? { NOT: { id: item.batchId } } : {}),
          },
          select: {
            id: true,
            stockQty: true,
            mrp: true,
            purchaseRate: true,
            sellingRate: true,
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
            rate: resolvePositiveRate(item.rate, batch, params.saleType),
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

    const billing = calculateBilling(expandedItems, params.gstMode ?? 'inclusive');

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
            gstPercent: item.gstPercent,
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
      // Guard against overselling under concurrency: only decrement when the row
      // still has enough stock. updateMany returns a count, so if a competing
      // transaction already drew the stock down, count === 0 and we abort the
      // whole sale instead of pushing stock negative.
      const result = await tx.inventoryBatch.updateMany({
        where: { id: batchId, stockQty: { gte: qty } },
        data: { stockQty: { decrement: qty } },
      });

      if (result.count === 0) {
        throw new Error('Insufficient stock: batch was updated by another transaction. Please retry.');
      }
    }

    return sale;
  });
}

/**
 * Get sale with all details (tenant-scoped)
 */
export async function getSaleDetails(saleId: string, shopId: string) {
  return prisma.sale.findFirst({
    where: { id: saleId, shopId },
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
 *
 * Previously this pulled every Sale row (createdAt + grandTotal) for the
 * whole date range into Node and grouped/summed them by hand. That means
 * the payload size and CPU work grows with the number of sales in the
 * range instead of the number of days — a year of daily billing could mean
 * thousands of rows crossing the wire just to add them up. Postgres can
 * group and sum in a single pass with `date_trunc`, so we let it.
 */
export async function getDailySalesSummary(
  shopId: string,
  startDate: Date,
  endDate: Date
) {
  const rows = await prisma.$queryRaw<
    { date: Date; total_sales: bigint; total_amount: Decimal }[]
  >`
    SELECT
      date_trunc('day', "createdAt") AS date,
      COUNT(*) AS total_sales,
      COALESCE(SUM("grandTotal"), 0) AS total_amount
    FROM "Sale"
    WHERE "shopId" = ${shopId}
      AND "createdAt" >= ${startDate}
      AND "createdAt" <= ${endDate}
    GROUP BY date
    ORDER BY date ASC
  `;

  return rows.map((row) => {
    const count = Number(row.total_sales);
    const total = new Decimal(row.total_amount);
    return {
      date: row.date,
      totalSales: count,
      totalAmount: total,
      transactionCount: count,
      avgTransactionValue: count > 0 ? total.dividedBy(count) : new Decimal(0),
    };
  });
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

  // Previously this did one findUnique per medicine in the top-10 list
  // (10 extra queries every time the report ran). A single findMany with
  // an `id IN (...)` filter gets the same data in one round trip.
  const medicineIds = result.map((item) => item.medicineId);
  const medicineRows = medicineIds.length
    ? await prisma.medicine.findMany({
        where: { id: { in: medicineIds } },
        select: { id: true, name: true, company: true },
      })
    : [];
  const medicineById = new Map(medicineRows.map((m) => [m.id, m]));

  return result.map((item: any) => {
    const medicine = medicineById.get(item.medicineId);
    return {
      medicineId: item.medicineId,
      name: medicine?.name || 'Unknown',
      company: medicine?.company || 'Unknown',
      totalQuantity: item._sum.quantity || 0,
      totalAmount: item._sum.amount || new Decimal(0),
    };
  });
}
