export type UserRole = 'ADMIN' | 'MANAGER' | 'CASHIER';
export type SaleType = 'RETAIL' | 'WHOLESALE' | 'TRANSFER';
export type PaymentMode = 'CASH' | 'CARD' | 'UPI' | 'CHEQUE' | 'CREDIT';
export type ReturnType = 'CUSTOMER_RETURN' | 'SUPPLIER_RETURN';

export interface JWTPayload {
  userId: string;
  shopId: string;
  email: string;
  role: UserRole;
  /** User.tokenVersion when the token was issued. */
  tv: number;
  /** Set on PIN (POS) sessions, which the sliding refresh never extends. */
  pos?: boolean;
  iat: number;
  exp: number;
}

export interface AuthUser {
  id: string;
  shopId: string;
  name: string;
  email: string;
  username?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  isActive: boolean;
  /** Computed server-side from SUPER_ADMIN_USER_IDS; UI hint only. */
  isSuperAdmin?: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface MedicineDTO {
  id: string;
  name: string;
  company: string;
  category: string;
  barcode?: string;
  hsn: string;
  unit: string;
  isActive: boolean;
  availableStock?: number;
  nextExpiryDate?: Date;
}

export interface BatchDTO {
  id: string;
  medicineId: string;
  batchNumber: string;
  expiryDate: Date;
  stockQty: number;
  mrp: number;
  purchaseRate: number;
  sellingRate: number;
  rackLocation?: string;
}

export interface CartItem {
  medicineId: string;
  medicineName: string;
  company: string;
  quantity: number;
  batchId: string;
  batchNumber: string;
  expiryDate: Date;
  mrp: number;
  rate: number;
  discount: number;
  discountPercent?: number;
  gstPercent: number;
  gst: number;
  amount: number;
  rackLocation: string;
}

export interface BillingRequest {
  customerId?: string;
  customer?: {
    name: string;
    phone: string;
    address: string;
    gstin?: string;
    drugLicense?: string;
    pan?: string;
  };
  saleType: SaleType;
  items: {
    medicineId: string;
    batchId: string;
    quantity: number;
    rate: number;
    discount: number;
    gstPercent: number;
  }[];
  discountTotal: number;
  paymentMode: PaymentMode;
  creditDue?: number;
}

export interface InventorySummary {
  medicineId: string;
  name: string;
  company: string;
  totalStock: number;
  batches: {
    batchId: string;
    batchNumber: string;
    expiryDate: Date;
    stockQty: number;
    mrp: number;
    daysToExpiry: number;
  }[];
}

export interface ReportFilter {
  startDate: Date;
  endDate: Date;
  shopId: string;
}

export interface DailySalesReport {
  date: Date;
  totalSales: number;
  totalAmount: number;
  transactionCount: number;
  avgTransactionValue: number;
}

export interface LowStockReport {
  medicineId: string;
  name: string;
  company: string;
  currentStock: number;
  minStockLevel: number;
}

export interface NearExpiryReport {
  medicineId: string;
  batchId: string;
  batchNumber: string;
  name: string;
  company: string;
  expiryDate: Date;
  stockQty: number;
  daysToExpiry: number;
}
