import { prisma } from '@/lib/db';
import { Decimal } from '@prisma/client/runtime/library';
import { PaymentMode, SaleType } from '@/types';
import { batchLabel, isBatchExpired, startOfTodayUtc } from '@/lib/batch';
import { recordMovement, saleMovementType } from '@/lib/stock-movement';

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

/** A rule the request broke; the route answers 400 with this message. */
export class BillingError extends Error {}

type PricedBatch = { sellingRate: Decimal; mrp: Decimal; purchaseRate?: Decimal | null };

const PRICE_EPSILON = 0.005;

/**
 * The rate a batch sells at when nobody overrides it: trade price for
 * wholesale/transfer (when known), else the selling rate, else MRP; never
 * above MRP. Matches getBillingRate() on the POS screen.
 */
export function defaultRate(batch: PricedBatch, saleType: SaleType): number {
  const purchaseRate = Number(batch.purchaseRate || 0);
  const sellingRate = Number(batch.sellingRate || 0);
  const mrp = Number(batch.mrp || 0);

  const rate =
    (saleType === 'WHOLESALE' || saleType === 'TRANSFER') && purchaseRate > 0
      ? purchaseRate
      : sellingRate > 0
        ? sellingRate
        : mrp;
  return mrp > 0 ? Math.min(rate, mrp) : rate;
}

export type SellerRole = 'ADMIN' | 'MANAGER' | 'CASHIER';

export interface DiscountCaps {
  CASHIER: number;
  MANAGER: number;
  ADMIN: number;
}

export const DEFAULT_DISCOUNT_CAPS: DiscountCaps = { CASHIER: 10, MANAGER: 25, ADMIN: 100 };

/**
 * Check a price override for one batch. Overrides are MANAGER+ only and must
 * sit between purchase cost and MRP; an ADMIN may go below cost (returned as
 * a warning and logged), a MANAGER may not.
 */
function checkOverride(rate: number, batch: PricedBatch, role: SellerRole, label: string): string | null {
  if (role === 'CASHIER') {
    throw new BillingError('Only a manager or admin can change the selling price.');
  }
  const mrp = Number(batch.mrp || 0);
  if (mrp > 0 && rate > mrp + PRICE_EPSILON) {
    throw new BillingError(`Price ₹${rate.toFixed(2)} for ${label} is above MRP ₹${mrp.toFixed(2)}.`);
  }
  const cost = Number(batch.purchaseRate || 0);
  if (cost > 0 && rate < cost - PRICE_EPSILON) {
    if (role !== 'ADMIN') {
      throw new BillingError(`Price ₹${rate.toFixed(2)} for ${label} is below purchase cost ₹${cost.toFixed(2)}. Only an admin can sell below cost.`);
    }
    return `${label} sold at ₹${rate.toFixed(2)}, below purchase cost ₹${cost.toFixed(2)}`;
  }
  return null;
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
 * Create a sale/invoice.
 *
 * Prices, GST, discounts and totals are computed here from the database;
 * the client only says what to sell. Its rate is honoured only as a price
 * override (MANAGER+, between cost and MRP), its discount only within the
 * seller's role cap, and its GST percent and totals are ignored.
 */
export async function createSale(params: {
  shopId: string;
  customerId?: string | null;
  saleType: SaleType;
  items: BillingItem[];
  paymentMode: PaymentMode;
  /** Received up front on a CREDIT sale; the rest becomes creditDue. */
  amountPaid?: number;
  /** Legacy clients sent creditDue instead of amountPaid. */
  creditDue?: number;
  sellerRole: SellerRole;
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

    const billingSettings = await tx.billingSettings.findUnique({ where: { shopId: params.shopId } });
    const gstMode: GstMode = billingSettings?.gstMode === 'exclusive' ? 'exclusive' : 'inclusive';
    const discountCap = billingSettings
      ? {
          CASHIER: billingSettings.maxDiscountPercentCashier,
          MANAGER: billingSettings.maxDiscountPercentManager,
          ADMIN: billingSettings.maxDiscountPercentAdmin,
        }[params.sellerRole]
      : DEFAULT_DISCOUNT_CAPS[params.sellerRole];
    const allowDiscounts = billingSettings?.allowDiscounts ?? true;

    if (params.customerId) {
      const customer = await tx.customer.findFirst({
        where: { id: params.customerId, shopId: params.shopId },
        select: { id: true },
      });
      if (!customer) throw new BillingError('Customer not found');
    }

    // createMany + skipDuplicates is INSERT ... ON CONFLICT DO NOTHING, so the
    // first two sales of a new shop cannot collide creating this row (an
    // upsert's find-then-insert can).
    await tx.invoiceSettings.createMany({
      skipDuplicates: true,
      data: {
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
    const warnings: string[] = [];
    const sellableFrom = startOfTodayUtc();
    const batchSelect = {
      id: true,
      medicineId: true,
      batchNumber: true,
      expiryDate: true,
      stockQty: true,
      mrp: true,
      purchaseRate: true,
      sellingRate: true,
    } as const;

    for (const item of params.items) {
      const medicine = await tx.medicine.findFirst({
        where: { id: item.medicineId, shopId: params.shopId },
        select: { name: true, gstPercent: true },
      });
      if (!medicine) {
        throw new BillingError(`Medicine not found: ${item.medicineId}`);
      }

      const totalQty = item.quantity;
      let remaining = totalQty;
      const slices: { batch: { id: string; mrp: Decimal; purchaseRate: Decimal | null; sellingRate: Decimal }; qty: number }[] = [];

      if (item.batchId) {
        const preferredBatch = await tx.inventoryBatch.findFirst({
          where: {
            id: item.batchId,
            shopId: params.shopId,
            deletedAt: null,
          },
          select: batchSelect,
        });

        if (!preferredBatch) {
          throw new BillingError(`Batch not found: ${item.batchId}`);
        }

        if (preferredBatch.medicineId !== item.medicineId) {
          throw new BillingError(`Batch ${item.batchId} does not belong to medicine ${item.medicineId}`);
        }

        if (isBatchExpired(preferredBatch.expiryDate)) {
          throw new BillingError(`Batch ${batchLabel(preferredBatch)} is expired and cannot be billed`);
        }

        const alreadyReserved = reservedQty.get(preferredBatch.id) || 0;
        const available = preferredBatch.stockQty - alreadyReserved;
        if (available > 0) {
          const takeQty = Math.min(available, remaining);
          slices.push({ batch: preferredBatch, qty: takeQty });
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
            expiryDate: { gte: sellableFrom },
            deletedAt: null,
            ...(item.batchId ? { NOT: { id: item.batchId } } : {}),
          },
          select: batchSelect,
          // FEFO: earliest expiry first.
          orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
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
          slices.push({ batch, qty: takeQty });
          reservedQty.set(batch.id, alreadyReserved + takeQty);
          remaining -= takeQty;
        }
      }

      if (remaining > 0) {
        const allocated = totalQty - remaining;
        throw new BillingError(
          `Insufficient stock for medicine ${item.medicineId}. Requested ${totalQty}, available ${allocated}`
        );
      }

      // The client's rate is an override only when it differs from what the
      // first batch drawn would sell at; otherwise every batch uses its own rate.
      const requested = Number(item.rate || 0);
      const isOverride =
        requested > 0 && Math.abs(requested - defaultRate(slices[0].batch, params.saleType)) > PRICE_EPSILON;
      const priced = slices.map(({ batch, qty }) => {
        let rate = defaultRate(batch, params.saleType);
        if (isOverride) {
          const warning = checkOverride(requested, batch, params.sellerRole, medicine.name);
          if (warning) warnings.push(warning);
          rate = requested;
        }
        return { batch, qty, rate };
      });

      const lineTotal = priced.reduce((sum, p) => sum + p.qty * p.rate, 0);
      const discount = Number(item.discount || 0);
      if (discount > 0) {
        if (!allowDiscounts) {
          throw new BillingError('Discounts are turned off for this shop.');
        }
        if (discount > lineTotal + PRICE_EPSILON) {
          throw new BillingError(`Discount on ${medicine.name} is more than the line total.`);
        }
        if ((discount / lineTotal) * 100 > discountCap + 0.01) {
          throw new BillingError(`Discount on ${medicine.name} exceeds the ${discountCap}% allowed for your role.`);
        }
      }

      let discountLeft = new Decimal(discount);
      priced.forEach(({ batch, qty, rate }, index) => {
        // Split the line discount by value; the last batch takes the rounding remainder.
        const share =
          index === priced.length - 1
            ? discountLeft
            : new Decimal(discount).times(qty * rate).dividedBy(lineTotal || 1).toDecimalPlaces(2);
        discountLeft = discountLeft.minus(share);
        expandedItems.push({
          medicineId: item.medicineId,
          batchId: batch.id,
          quantity: qty,
          rate,
          discount: share.toNumber(),
          gstPercent: medicine.gstPercent,
        });
      });
    }

    const billing = calculateBilling(expandedItems, gstMode);
    if (billing.grandTotal.isNegative()) {
      throw new BillingError('Invoice total cannot be negative.');
    }

    const grandTotal = billing.grandTotal.toDecimalPlaces(2);
    let creditDue: Decimal | null = null;
    if (params.paymentMode === 'CREDIT') {
      const paid =
        params.amountPaid !== undefined
          ? new Decimal(params.amountPaid)
          : params.creditDue !== undefined
            ? grandTotal.minus(params.creditDue)
            : new Decimal(0);
      creditDue = grandTotal.minus(Decimal.max(0, Decimal.min(paid, grandTotal))).toDecimalPlaces(2);
    }

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
        discountTotal: billing.totalDiscount,
        gstTotal: billing.totalGst,
        grandTotal: billing.grandTotal,
        paymentMode: params.paymentMode,
        creditDue,
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

    // One movement per batch drawn. recordMovement guards the decrement, so a
    // competing transaction that already drew the stock down aborts the whole
    // sale instead of pushing stock negative.
    const movementType = saleMovementType(params.saleType);
    for (const [batchId, qty] of reservedQty.entries()) {
      await recordMovement(tx, {
        shopId: params.shopId,
        batchId,
        type: movementType,
        qtyChange: -qty,
        refType: 'SALE',
        refId: sale.id,
        note: `Invoice ${invoiceNumber}`,
        userId: params.createdByUserId,
      });
    }

    if (warnings.length > 0) {
      await tx.activityLog.create({
        data: {
          shopId: params.shopId,
          userId: params.createdByUserId,
          action: 'SALE_BELOW_COST',
          meta: JSON.stringify({ saleId: sale.id, invoiceNumber, warnings }),
        },
      });
    }

    return { ...sale, warnings };
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
