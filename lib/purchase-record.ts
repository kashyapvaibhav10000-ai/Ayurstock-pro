import { Prisma, PurchaseSource } from '@prisma/client';
import { recordMovement } from '@/lib/stock-movement';

type Tx = Prisma.TransactionClient;
type Money = Prisma.Decimal | number | string;

/**
 * Every inventory inflow (distributor invoice, AI import, manual add) is
 * recorded as a Purchase. Purchase.supplierId and invoiceNumber are
 * required, so entries without a distributor use a per-shop placeholder
 * supplier and get an auto-generated invoice number.
 */

const PLACEHOLDER_SUPPLIER: Record<'MANUAL' | 'AI_IMPORT', string> = {
  MANUAL: 'Manual Entry',
  AI_IMPORT: 'AI Import',
};

const INVOICE_PREFIX: Record<PurchaseSource, string> = {
  INVOICE: 'INV',
  AI_IMPORT: 'AI',
  MANUAL: 'MAN',
};

export function placeholderSupplierName(source: 'MANUAL' | 'AI_IMPORT') {
  return PLACEHOLDER_SUPPLIER[source];
}

async function findOrCreateSupplierByName(tx: Tx, shopId: string, name: string) {
  return tx.supplier.upsert({
    where: { shopId_name: { shopId, name } },
    update: {},
    create: { shopId, name, phone: '', email: '', address: '' },
    select: { id: true },
  });
}

/**
 * Resolve the supplier for an inflow: an explicit supplierId (must belong to
 * the shop), else a supplier by name (created if new), else the placeholder.
 */
export async function resolveSupplierId(
  tx: Tx,
  shopId: string,
  opts: { supplierId?: string | null; supplierName?: string | null; fallback: 'MANUAL' | 'AI_IMPORT' }
): Promise<string> {
  if (opts.supplierId) {
    const supplier = await tx.supplier.findFirst({
      where: { id: opts.supplierId, shopId },
      select: { id: true },
    });
    if (!supplier) throw new Error('Supplier not found');
    return supplier.id;
  }

  const name = opts.supplierName?.trim();
  const supplier = await findOrCreateSupplierByName(tx, shopId, name || PLACEHOLDER_SUPPLIER[opts.fallback]);
  return supplier.id;
}

/**
 * Pick an invoice number that is free in this shop. A provided number is
 * kept when free, otherwise suffixed (-2, -3, ...); a missing one becomes
 * e.g. MAN-20261030-0001.
 */
export async function uniqueInvoiceNumber(
  tx: Tx,
  shopId: string,
  source: PurchaseSource,
  preferred?: string | null
): Promise<string> {
  const isTaken = async (invoiceNumber: string) =>
    (await tx.purchase.count({ where: { shopId, invoiceNumber } })) > 0;

  const base = preferred?.trim();
  if (base) {
    if (!(await isTaken(base))) return base;
    for (let n = 2; n < 1000; n++) {
      const candidate = `${base}-${n}`;
      if (!(await isTaken(candidate))) return candidate;
    }
    throw new Error(`Could not allocate an invoice number for ${base}`);
  }

  const now = new Date();
  const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const prefix = `${INVOICE_PREFIX[source]}-${day}-`;
  let seq = (await tx.purchase.count({ where: { shopId, invoiceNumber: { startsWith: prefix } } })) + 1;
  for (;;) {
    const candidate = `${prefix}${String(seq).padStart(4, '0')}`;
    if (!(await isTaken(candidate))) return candidate;
    seq += 1;
  }
}

export interface InflowLine {
  medicineId: string;
  batchId: string;
  /** Paid quantity in base units. */
  quantity: number;
  /** Free quantity in base units. */
  freeQty?: number;
  scheme?: string | null;
  /** Rate per base unit. */
  purchaseRate?: Money | null;
  mrp: Money;
  discount?: Money;
  gst?: Money;
  expiryDate: Date;
}

export interface InflowPurchaseInput {
  shopId: string;
  userId: string;
  source: PurchaseSource;
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  gstType?: string;
  paymentType?: string;
  status?: string;
  notes?: string | null;
  documentId?: string | null;
  lines: InflowLine[];
}

const dec = (value: Money | null | undefined) => new Prisma.Decimal(value ?? 0);

function lineTotals(lines: InflowLine[]) {
  let subtotal = new Prisma.Decimal(0);
  let discountTotal = new Prisma.Decimal(0);
  let gstTotal = new Prisma.Decimal(0);
  for (const line of lines) {
    subtotal = subtotal.plus(dec(line.purchaseRate).times(line.quantity));
    discountTotal = discountTotal.plus(dec(line.discount));
    gstTotal = gstTotal.plus(dec(line.gst));
  }
  return { subtotal, discountTotal, gstTotal, totalAmount: subtotal.minus(discountTotal).plus(gstTotal) };
}

function lineCreateData(line: InflowLine) {
  return {
    medicineId: line.medicineId,
    batchId: line.batchId,
    quantity: line.quantity,
    freeQty: line.freeQty ?? 0,
    scheme: line.scheme?.trim() || null,
    purchaseRate: line.purchaseRate === null || line.purchaseRate === undefined ? null : dec(line.purchaseRate),
    mrp: dec(line.mrp),
    discount: dec(line.discount),
    gst: dec(line.gst),
    expiryDate: line.expiryDate,
  };
}

async function recordLineMovements(
  tx: Tx,
  input: { shopId: string; userId: string; source: PurchaseSource; purchaseId: string; lines: InflowLine[] }
) {
  const movementType = input.source === 'MANUAL' ? 'MANUAL_ADD' : 'PURCHASE';
  for (const line of input.lines) {
    const totalQty = line.quantity + (line.freeQty ?? 0);
    if (totalQty <= 0) continue;
    await recordMovement(tx, {
      shopId: input.shopId,
      medicineId: line.medicineId,
      batchId: line.batchId,
      type: movementType,
      qtyChange: totalQty,
      refType: 'PURCHASE',
      refId: input.purchaseId,
      note: line.freeQty ? `Includes ${line.freeQty} free` : null,
      userId: input.userId,
    });
  }
}

/**
 * Create the Purchase + lines and add each line's stock through
 * recordMovement, all inside the caller's transaction.
 */
export async function createInflowPurchase(tx: Tx, input: InflowPurchaseInput) {
  const totals = lineTotals(input.lines);

  if (input.documentId) {
    const doc = await tx.purchaseDocument.findFirst({
      where: { id: input.documentId, shopId: input.shopId, purchase: null },
      select: { id: true },
    });
    if (!doc) throw new Error('Invoice document not found or already used');
  }

  const purchase = await tx.purchase.create({
    data: {
      shopId: input.shopId,
      supplierId: input.supplierId,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: input.invoiceDate,
      gstType: input.gstType ?? 'GST',
      paymentType: input.paymentType ?? 'CASH',
      status: input.status ?? 'PAID',
      ...totals,
      notes: input.notes?.trim() || null,
      source: input.source,
      createdByUserId: input.userId,
      documentId: input.documentId ?? null,
      purchaseItems: { create: input.lines.map(lineCreateData) },
    },
    include: { supplier: { select: { name: true } }, purchaseItems: true },
  });

  await recordLineMovements(tx, { ...input, purchaseId: purchase.id });
  return purchase;
}

/**
 * Manual adds that name an invoice number already used by a MANUAL purchase
 * from the same supplier are appended to that purchase instead of creating
 * a suffixed duplicate.
 */
export async function addToManualPurchaseOrCreate(
  tx: Tx,
  input: Omit<InflowPurchaseInput, 'source' | 'invoiceNumber'> & { invoiceNumber?: string | null }
) {
  const invoiceNumber = input.invoiceNumber?.trim();
  if (invoiceNumber) {
    const existing = await tx.purchase.findFirst({
      where: { shopId: input.shopId, invoiceNumber, supplierId: input.supplierId, source: 'MANUAL' },
      select: { id: true },
    });
    if (existing) {
      const totals = lineTotals(input.lines);
      const purchase = await tx.purchase.update({
        where: { id: existing.id },
        data: {
          subtotal: { increment: totals.subtotal },
          discountTotal: { increment: totals.discountTotal },
          gstTotal: { increment: totals.gstTotal },
          totalAmount: { increment: totals.totalAmount },
          purchaseItems: { create: input.lines.map(lineCreateData) },
        },
      });
      await recordLineMovements(tx, { ...input, source: 'MANUAL', purchaseId: purchase.id });
      return purchase;
    }
  }

  return createInflowPurchase(tx, {
    ...input,
    source: 'MANUAL',
    invoiceNumber: await uniqueInvoiceNumber(tx, input.shopId, 'MANUAL', invoiceNumber),
  });
}

/** Store an uploaded invoice file; returns its id for linking on save. */
export async function storePurchaseDocument(
  tx: Tx,
  input: { shopId: string; userId: string; fileName: string; mimeType: string; data: Buffer }
) {
  // Prune uploads that were parsed but never turned into a purchase.
  await tx.purchaseDocument.deleteMany({
    where: {
      shopId: input.shopId,
      purchase: null,
      createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });

  const doc = await tx.purchaseDocument.create({
    data: {
      shopId: input.shopId,
      uploadedByUserId: input.userId,
      fileName: input.fileName.slice(0, 255) || 'invoice',
      mimeType: input.mimeType || 'application/octet-stream',
      size: input.data.length,
      data: input.data,
    },
    select: { id: true },
  });
  return doc.id;
}
