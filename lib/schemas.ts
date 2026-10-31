import { z } from 'zod';

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
  .object({
    identifier: z.string().trim().min(1).max(254).optional(),
    email: z.string().trim().min(1).max(254).optional(),
    password: z.string().min(1).max(200),
  })
  .refine((data) => data.identifier || data.email, { message: 'Username or email is required' });

export const POSLoginSchema = z.object({
  pin: z.string().length(4, 'PIN must be 4 digits').regex(/^\d+$/, 'PIN must be numeric'),
});

// User Schemas
export const CreateUserSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email'),
  role: z.enum(['ADMIN', 'MANAGER', 'CASHIER']),
});

export const UpdateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'CASHIER']).optional(),
  isActive: z.boolean().optional(),
  pin: z.string().length(4).optional(),
});

export const ProfileSettingsSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email'),
  // Optional: omitted = unchanged, null / '' = cleared. Rules in lib/username.ts.
  username: z.string().max(100).optional().nullable(),
  phone: z.string().min(6, 'Valid phone number required').optional().nullable(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200).optional().nullable(),
  avatarUrl: z.string().optional().nullable(),
  // Admins only. Omitted = unchanged, null / '' = removed, else 4 digits.
  pin: z.string().max(10).optional().nullable(),
  // Required when email, username or password changes.
  currentPassword: z.string().max(200).optional().nullable(),
});

// Shop Settings Schema
export const ShopSettingsSchema = z.object({
  shopName: z.string().trim().optional().nullable().default(''),
  addressLine1: z.string().trim().optional().nullable().default(''),
  addressLine2: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable().default(''),
  email: z.union([z.string().email('Valid email required'), z.literal('')]).optional().nullable(),
  gstin: z.string().trim().optional().nullable().default(''),
  drugLicense: z.string().trim().optional().nullable().default(''),
  state: z.string().trim().optional().nullable().default(''),
  stateCode: z.string().trim().optional().nullable().default(''),
  invoiceTerms: z.string().trim().optional().nullable().default(''),
});

// Medicine Schemas
export const CreateMedicineSchema = z.object({
  name: z.string().min(2, 'Medicine name is required'),
  company: z.string().min(1, 'Company is required'),
  category: z.string().min(1, 'Category is required'),
  barcode: z.string().optional(),
  hsn: z.string().min(1, 'HSN is required'),
  unit: z.string().default('strip'),
  packing: z.string().trim().optional(),
});

export const UpdateMedicineSchema = CreateMedicineSchema.partial();

// Batch Schemas
export const CreateBatchSchema = z.object({
  medicineId: z.string().min(1, 'Medicine ID is required'),
  batchNumber: z.string().min(1, 'Batch number is required'),
  expiryDate: z.coerce.date(),
  stockQty: z.number().int().min(0),
  mrp: z.number().positive('MRP must be positive'),
  purchaseRate: z.number().min(0, 'Purchase rate cannot be negative').optional().nullable(),
  sellingRate: z.number().positive('Selling rate must be positive'),
  rackLocation: z.string().trim().optional(),
  packing: z.string().trim().optional(),
  gstPercent: z.number().int().min(0).max(28).optional().default(0),
  // Optional purchase details; without them a MANUAL purchase is recorded
  // against the "Manual Entry" placeholder with an auto invoice number.
  supplierId: z.string().trim().optional().nullable(),
  invoiceNumber: z.string().trim().max(60).optional().nullable(),
});

export const CreateCompanySchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  description: z.string().trim().optional(),
});

export const UpdateCompanySchema = CreateCompanySchema.extend({
  id: z.string().min(1, 'Company id is required'),
});

// Supplier Schemas
export const CreateSupplierSchema = z.object({
  name: z.string().min(2, 'Supplier name is required'),
  contactPerson: z.string().trim().optional(),
  phone: z.string().min(10, 'Valid phone number required'),
  email: z.string().email().optional(),
  address: z.string().min(5, 'Address is required'),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  gstin: z.string().optional(),
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

export const UpdateSupplierSchema = CreateSupplierSchema.extend({
  id: z.string().min(1, 'Supplier id is required'),
});

// Customer Schemas
export const CreateCustomerSchema = z.object({
  name: z.string().min(2, 'Customer name is required'),
  phone: z.string().min(10, 'Valid phone number required'),
  address: z.string().min(5, 'Address is required'),
  gstin: z.string().trim().optional().default(''),
  drugLicense: z.string().trim().optional().default(''),
  pan: z.string().trim().optional().default(''),
  isWholesale: z.boolean().optional().default(false),
});

export const UpdateCustomerSchema = CreateCustomerSchema.partial();

// Invoice Settings Schema
export const InvoiceSettingsSchema = z.object({
  invoicePrefix: z.string().min(1, 'Invoice prefix is required').default('INV-'),
  watermarkText: z.string().trim().default(''),
  watermarkEnabled: z.boolean().default(true),
});

// Purchase Schemas
export const CreatePurchaseSchema = z.object({
  supplierId: z.string().min(1, 'Supplier is required'),
  invoiceNumber: z.string().trim().min(1, 'Invoice number is required'),
  invoiceDate: z.coerce.date(),
  gstType: z.string().min(1).default('GST'),
  paymentType: z.string().min(1).default('CASH'),
  status: z.enum(['PAID', 'PENDING', 'PARTIAL']).default('PAID'),
  notes: z.string().trim().optional(),
  // Set when the lines were filled from an AI-scanned invoice; links the
  // stored file and marks the purchase source AI_IMPORT.
  documentId: z.string().min(1).optional().nullable(),
  items: z.array(
    z.object({
      medicineId: z.string().min(1, 'Medicine is required'),
      batchNumber: z.string().trim().min(1, 'Batch number is required'),
      expiryDate: z.coerce.date(),
      quantity: z.number().int().positive(),
      freeQty: z.number().int().min(0).default(0),
      scheme: z.string().optional(),
      purchaseRate: z.number().positive().optional().nullable(),
      mrp: z.number().positive(),
      discount: z.number().min(0).default(0),
      gst: z.number().min(0).default(0),
      rackLocation: z.string().trim().optional(),
      // Packaging: quantity / freeQty are in packs and pricePerPack is per
      // pack when unitsPerPack > 1. Omitted = entered in base units.
      packType: z.enum(['BOX', 'STRIP', 'BOTTLE', 'JAR', 'PACKET', 'LOOSE']).optional().nullable(),
      unitsPerPack: z.number().int().min(1).max(100000).default(1),
      pricePerPack: z.number().positive().optional().nullable(),
    })
  ).min(1, 'At least one item is required'),
});

// Sale/Billing Schemas
export const CreateSaleSchema = z.object({
  customerId: z.string().optional().nullable(),
  customer: z
    .object({
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
    z.object({
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

// Return Schemas
export const CreateReturnSchema = z.object({
  type: z.enum(['CUSTOMER_RETURN', 'SUPPLIER_RETURN']),
  referenceId: z.string(),
  medicineId: z.string(),
  batchId: z.string(),
  quantity: z.number().int().positive(),
  reason: z.string().min(5),
});

// Search Schema
export const MedicineSearchSchema = z.object({
  query: z.string().default(''),
  limit: z.number().int().positive().default(10),
  offset: z.number().int().min(0).default(0),
});

// Report Filters
export const ReportFilterSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  limit: z.number().int().positive().default(100),
  offset: z.number().int().min(0).default(0),
});
