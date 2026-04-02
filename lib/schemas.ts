import { z } from 'zod';

// Auth Schemas
export const LoginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

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
  phone: z.string().min(6, 'Valid phone number required').optional().nullable(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional().nullable(),
  avatarUrl: z.string().optional().nullable(),
});

// Shop Settings Schema
export const ShopSettingsSchema = z.object({
  shopName: z.string().trim().optional().nullable().default(''),
  addressLine1: z.string().trim().optional().nullable().default(''),
  addressLine2: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable().default(''),
  email: z.union([z.string().email('Valid email required'), z.literal('')]).optional().nullable(),
  gstin: z.string().trim().optional().nullable().default(''),
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

export const UpdateSupplierSchema = CreateSupplierSchema.extend({
  id: z.string().min(1, 'Supplier id is required'),
});

// Customer Schemas
export const CreateCustomerSchema = z.object({
  name: z.string().min(2, 'Customer name is required'),
  phone: z.string().min(10, 'Valid phone number required'),
  address: z.string().min(5, 'Address is required'),
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
    })
  ).min(1, 'At least one item is required'),
});

// Sale/Billing Schemas
export const CreateSaleSchema = z.object({
  customerId: z.string().optional().nullable(),
  customer: z
    .object({
      name: z.string().min(1, 'Customer name is required'),
      phone: z.string().optional().nullable().or(z.literal('')),
      address: z.string().optional().nullable().or(z.literal('')),
    })
    .optional(),
  saleType: z.enum(['RETAIL', 'WHOLESALE', 'TRANSFER']),
  items: z.array(
    z.object({
      medicineId: z.string(),
      batchId: z.string().optional().nullable(),
      quantity: z.number().int().positive(),
      rate: z.number().positive(),
      discount: z.number().min(0).default(0),
      gstPercent: z.number().min(0).max(100),
    })
  ).min(1, 'At least one item is required'),
  paymentMode: z.enum(['CASH', 'CARD', 'UPI', 'CHEQUE', 'CREDIT']),
  discountTotal: z.number().min(0).default(0),
  creditDue: z.number().min(0).optional(),
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
