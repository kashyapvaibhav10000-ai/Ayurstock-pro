-- Baseline: bring a database created from 0_init up to the schema that was
-- previously applied with `prisma db push`. Ordered before
-- 20260704_invoice_compliance_fields (which indexes "StockAdjustment") so a
-- fresh database can run the full migration chain.
--
-- Every statement is idempotent so this is also safe on a db-push-managed
-- database that already has these objects.

-- AlterTable: Customer
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "gstin" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isWholesale" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ALTER COLUMN "phone" SET DEFAULT '';
ALTER TABLE "Customer" ALTER COLUMN "address" SET DEFAULT '';

-- AlterTable: InventoryBatch
ALTER TABLE "InventoryBatch" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "InventoryBatch" ADD COLUMN IF NOT EXISTS "packing" TEXT DEFAULT '';

-- AlterTable: Medicine
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- AlterTable: MedicineReturn (mrp Float -> Decimal)
ALTER TABLE "MedicineReturn" ADD COLUMN IF NOT EXISTS "batchId" TEXT;
ALTER TABLE "MedicineReturn" ADD COLUMN IF NOT EXISTS "saleId" TEXT;
ALTER TABLE "MedicineReturn" ADD COLUMN IF NOT EXISTS "saleItemId" TEXT;
ALTER TABLE "MedicineReturn" ALTER COLUMN "mrp" SET DATA TYPE DECIMAL(65,30);

-- AlterTable: SaleItem
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "gstPercent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: ShopSettings
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "autoFEFOBilling" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "commanderActions" JSONB;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "drugLicense" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "enableBatchTracking" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "enableExpiryTracking" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "invoiceTerms" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "lowStockThreshold" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "nearExpiryDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "state" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "stateCode" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE IF NOT EXISTS "GstCategoryDefault" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "gstPercent" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GstCategoryDefault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BillingSettings" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "enableRetail" BOOLEAN NOT NULL DEFAULT true,
    "enableWholesale" BOOLEAN NOT NULL DEFAULT true,
    "allowDiscounts" BOOLEAN NOT NULL DEFAULT true,
    "enableBarcode" BOOLEAN NOT NULL DEFAULT true,
    "autoPrintInvoice" BOOLEAN NOT NULL DEFAULT false,
    "gstMode" TEXT NOT NULL DEFAULT 'inclusive',
    "defaultDiscountPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExpiryAlertSettings" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "enableWhatsApp" BOOLEAN NOT NULL DEFAULT true,
    "enableEmail" BOOLEAN NOT NULL DEFAULT true,
    "whatsappNumber" TEXT NOT NULL DEFAULT '',
    "emailAddress" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpiryAlertSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StockAdjustment" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "stockBefore" INTEGER NOT NULL,
    "stockAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GstCategoryDefault_shopId_idx" ON "GstCategoryDefault"("shopId");
CREATE UNIQUE INDEX IF NOT EXISTS "GstCategoryDefault_shopId_category_key" ON "GstCategoryDefault"("shopId", "category");
CREATE UNIQUE INDEX IF NOT EXISTS "BillingSettings_shopId_key" ON "BillingSettings"("shopId");
CREATE INDEX IF NOT EXISTS "BillingSettings_shopId_idx" ON "BillingSettings"("shopId");
CREATE UNIQUE INDEX IF NOT EXISTS "ExpiryAlertSettings_shopId_key" ON "ExpiryAlertSettings"("shopId");
CREATE INDEX IF NOT EXISTS "StockAdjustment_shopId_createdAt_idx" ON "StockAdjustment"("shopId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockAdjustment_batchId_idx" ON "StockAdjustment"("batchId");
CREATE INDEX IF NOT EXISTS "StockAdjustment_medicineId_idx" ON "StockAdjustment"("medicineId");
CREATE INDEX IF NOT EXISTS "StockAdjustment_userId_idx" ON "StockAdjustment"("userId");

-- AddForeignKey (guarded: ADD CONSTRAINT has no IF NOT EXISTS)
DO $$ BEGIN
  ALTER TABLE "GstCategoryDefault" ADD CONSTRAINT "GstCategoryDefault_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "BillingSettings" ADD CONSTRAINT "BillingSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ExpiryAlertSettings" ADD CONSTRAINT "ExpiryAlertSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MedicineReturn" ADD CONSTRAINT "MedicineReturn_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MedicineReturn" ADD CONSTRAINT "MedicineReturn_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MedicineReturn" ADD CONSTRAINT "MedicineReturn_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
