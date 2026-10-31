import { z } from 'zod';

// Request schemas are strict: a body with a key the schema does not know is
// rejected, so new fields can never slip through to the database unseen.

/** "Validation error: {field: [messages]}" for a 400 response. */
export function validationMessage(error: z.ZodError): string {
  return `Validation error: ${JSON.stringify(z.flattenError(error).fieldErrors)}`;
}

const optionalTrimmedString = (maxLength = 255) =>
  z
    .string()
    .trim()
    .max(maxLength, `Must be ${maxLength} characters or less`)
    .optional()
    .nullable()
    .or(z.literal(''));

const optionalGstin = optionalTrimmedString(15).refine(
  (value) =>
    !value ||
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value.toUpperCase()),
  'Invalid GSTIN'
);

// Auth Schemas
// identifier = username or email ("@" means email). email is the older field name.
export const LoginSchema = z
  .strictObject({
    identifier: z.string().trim().min(1).max(254).optional(),
    email: z.string().trim().min(1).max(254).optional(),
    password: z.string().min(1).max(200),
  })
  .refine((data) => data.identifier || data.email, { error: 'Username or email is required' });

export const POSLoginSchema = z.strictObject({
  pin: z.string().length(4, 'PIN must be 4 digits').regex(/^\d+$/, 'PIN must be numeric'),
});

export const ProfileSettingsSchema = z.strictObject({
  name: z.string().min(2, 'Name is required').max(120),
  email: z.email('Invalid email'),
  // Optional: omitted = unchanged, null / '' = cleared. Rules in lib/username.ts.
  username: z.string().max(100).optional().nullable(),
  phone: z.string().min(6, 'Valid phone number required').max(20).optional().nullable(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200).optional().nullable(),
  avatarUrl: z.string().max(2_000_000).optional().nullable(),
  // Admins only. Omitted = unchanged, null / '' = removed, else 4 digits.
  pin: z.string().max(10).optional().nullable(),
  // Required when email, username or password changes.
  currentPassword: z.string().max(200).optional().nullable(),
});

// Shop Settings Schema
export const ShopSettingsSchema = z.strictObject({
  shopName: z.string().trim().max(200).optional().nullable().default(''),
  addressLine1: z.string().trim().max(500).optional().nullable().default(''),
  addressLine2: z.string().trim().max(500).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable().default(''),
  email: z.union([z.email('Valid email required'), z.literal('')]).optional().nullable(),
  gstin: z.string().trim().max(20).optional().nullable().default(''),
  drugLicense: z.string().trim().max(100).optional().nullable().default(''),
  state: z.string().trim().max(100).optional().nullable().default(''),
  stateCode: z.string().trim().max(10).optional().nullable().default(''),
  invoiceTerms: z.string().trim().max(5000).optional().nullable().default(''),
});

// Medicine Schemas
export const CreateMedicineSchema = z.strictObject({
  name: z.string().min(2, 'Medicine name is required').max(200),
  company: z.string().min(1, 'Company is required').max(200),
  category: z.string().min(1, 'Category is required').max(100),
  barcode: z.string().max(100).optional(),
  hsn: z.string().min(1, 'HSN is required').max(20),
  unit: z.string().max(30).default('strip'),
  packing: z.string().trim().max(100).optional(),
  gstPercent: z.number().int().min(0).max(28).optional(),
});

// Batch Schemas
export const CreateBatchSchema = z.strictObject({
  medicineId: z.string().min(1, 'Medicine ID is required'),
  batchNumber: z.string().min(1, 'Batch number is required').max(60),
  expiryDate: z.coerce.date(),
  stockQty: z.number().int().min(0).max(10_000_000),
  mrp: z.number().positive('MRP must be positive').max(10_000_000),
  purchaseRate: z.number().min(0, 'Purchase rate cannot be negative').max(10_000_000).optional().nullable(),
  sellingRate: z.number().positive('Selling rate must be positive').max(10_000_000),
  rackLocation: z.string().trim().max(100).optional(),
  packing: z.string().trim().max(100).optional(),
  gstPercent: z.number().int().min(0).max(28).optional().default(0),
  // Optional purchase details; without them a MANUAL purchase is recorded
  // against the "Manual Entry" placeholder with an auto invoice number.
  supplierId: z.string().trim().optional().nullable(),
  invoiceNumber: z.string().trim().max(60).optional().nullable(),
});

const SUPPLIER_FIELDS = ['name', 'contactPerson', 'phone', 'email', 'address', 'city', 'state', 'gstin'] as const;

/**
 * Only the editable supplier columns, as trimmed strings. Anything else in
 * the body (id, shopId, timestamps) is dropped so it can never be written.
 */
export function supplierFields(body: unknown): Partial<Record<(typeof SUPPLIER_FIELDS)[number], string>> | null {
  if (!body || typeof body !== 'object') return null;
  const out: Partial<Record<(typeof SUPPLIER_FIELDS)[number], string>> = {};
  for (const field of SUPPLIER_FIELDS) {
    const value = (body as Record<string, unknown>)[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string' || value.length > 500) return null;
    out[field] = value.trim();
  }
  return out;
}

// Customer Schemas
export const CreateCustomerSchema = z.strictObject({
  name: z.string().min(2, 'Customer name is required').max(120),
  phone: z.string().min(10, 'Valid phone number required').max(30),
  address: z.string().min(5, 'Address is required').max(500),
  gstin: z.string().trim().max(20).optional().default(''),
  drugLicense: z.string().trim().max(80).optional().default(''),
  pan: z.string().trim().max(10).optional().default(''),
  isWholesale: z.boolean().optional().default(false),
});

export const UpdateCustomerSchema = CreateCustomerSchema.partial();

// Invoice Settings Schema
export const InvoiceSettingsSchema = z.strictObject({
  invoicePrefix: z.string().min(1, 'Invoice prefix is required').max(20).default('INV-'),
  watermarkText: z.string().trim().max(100).default(''),
  watermarkEnabled: z.boolean().default(true),
});

// Purchase Schemas
export const CreatePurchaseSchema = z.strictObject({
  supplierId: z.string().min(1, 'Supplier is required'),
  invoiceNumber: z.string().trim().min(1, 'Invoice number is required').max(60),
  invoiceDate: z.coerce.date(),
  gstType: z.string().min(1).max(20).default('GST'),
  paymentType: z.string().min(1).max(20).default('CASH'),
  status: z.enum(['PAID', 'PENDING', 'PARTIAL']).default('PAID'),
  notes: z.string().trim().max(2000).optional(),
  // Set when the lines were filled from an AI-scanned invoice; links the
  // stored file and marks the purchase source AI_IMPORT.
  documentId: z.string().min(1).optional().nullable(),
  items: z.array(
    z.strictObject({
      medicineId: z.string().min(1, 'Medicine is required'),
      batchNumber: z.string().trim().min(1, 'Batch number is required').max(60),
      expiryDate: z.coerce.date(),
      quantity: z.number().int().positive().max(1_000_000),
      freeQty: z.number().int().min(0).max(1_000_000).default(0),
      scheme: z.string().max(100).optional(),
      purchaseRate: z.number().positive().max(10_000_000).optional().nullable(),
      mrp: z.number().positive().max(10_000_000),
      discount: z.number().min(0).max(10_000_000).default(0),
      gst: z.number().min(0).max(100).default(0),
      rackLocation: z.string().trim().max(100).optional(),
      // Packaging: quantity / freeQty are in packs and pricePerPack is per
      // pack when unitsPerPack > 1. Omitted = entered in base units.
      packType: z.enum(['BOX', 'STRIP', 'BOTTLE', 'JAR', 'PACKET', 'LOOSE']).optional().nullable(),
      unitsPerPack: z.number().int().min(1).max(100000).default(1),
      pricePerPack: z.number().positive().max(10_000_000).optional().nullable(),
    })
  ).min(1, 'At least one item is required').max(500),
});

// Sale/Billing Schemas
export const CreateSaleSchema = z.strictObject({
  customerId: z.string().optional().nullable(),
  customer: z
    .strictObject({
      name: optionalTrimmedString(120),
      phone: optionalTrimmedString(30),
      address: optionalTrimmedString(500),
      gstin: optionalGstin,
      drugLicense: optionalTrimmedString(80),
      pan: optionalTrimmedString(10).refine(
        (value) => !value || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value.toUpperCase()),
        'Invalid PAN'
      ),
    })
    .optional(),
  saleType: z.enum(['RETAIL', 'WHOLESALE', 'TRANSFER']),
  // rate is a price override request (checked server-side); GST percent,
  // GST mode and totals sent by older clients are accepted but ignored.
  items: z.array(
    z.strictObject({
      medicineId: z.string().max(64),
      batchId: z.string().max(64).optional().nullable(),
      quantity: z.number().int().positive().max(100000),
      rate: z.number().min(0).max(10_000_000),
      discount: z.number().min(0).max(10_000_000).default(0),
      gstPercent: z.number().optional(),
    })
  ).min(1, 'At least one item is required').max(500),
  paymentMode: z.enum(['CASH', 'CARD', 'UPI', 'CHEQUE', 'CREDIT']),
  discountTotal: z.number().optional(),
  gstMode: z.enum(['inclusive', 'exclusive']).optional(),
  amountPaid: z.number().min(0).max(100_000_000).optional(),
  creditDue: z.number().min(0).max(100_000_000).optional(),
});
