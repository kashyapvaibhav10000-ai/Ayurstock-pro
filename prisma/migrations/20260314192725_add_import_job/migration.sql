/*
  Warnings:

  - You are about to drop the column `rackLocation` on the `Medicine` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN "city" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "contactPerson" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "state" TEXT;

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Company_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "currentPage" INTEGER NOT NULL DEFAULT 0,
    "totalPages" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "error" TEXT,
    "medicines" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InvoiceSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "gstin" TEXT NOT NULL,
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV-',
    "nextInvoiceNumber" INTEGER NOT NULL DEFAULT 1,
    "watermarkText" TEXT NOT NULL DEFAULT '',
    "watermarkEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InvoiceSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_InvoiceSettings" ("addressLine1", "addressLine2", "createdAt", "email", "gstin", "id", "invoicePrefix", "nextInvoiceNumber", "phone", "shopId", "shopName", "updatedAt", "watermarkEnabled", "watermarkText") SELECT "addressLine1", "addressLine2", "createdAt", "email", "gstin", "id", "invoicePrefix", "nextInvoiceNumber", "phone", "shopId", "shopName", "updatedAt", "watermarkEnabled", "watermarkText" FROM "InvoiceSettings";
DROP TABLE "InvoiceSettings";
ALTER TABLE "new_InvoiceSettings" RENAME TO "InvoiceSettings";
CREATE UNIQUE INDEX "InvoiceSettings_shopId_key" ON "InvoiceSettings"("shopId");
CREATE INDEX "InvoiceSettings_shopId_idx" ON "InvoiceSettings"("shopId");
CREATE TABLE "new_Medicine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "barcode" TEXT,
    "hsn" TEXT NOT NULL,
    "packing" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'strip',
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Medicine_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Medicine" ("barcode", "category", "company", "createdAt", "hsn", "id", "isActive", "name", "packing", "shopId", "unit", "updatedAt") SELECT "barcode", "category", "company", "createdAt", "hsn", "id", "isActive", "name", "packing", "shopId", "unit", "updatedAt" FROM "Medicine";
DROP TABLE "Medicine";
ALTER TABLE "new_Medicine" RENAME TO "Medicine";
CREATE INDEX "Medicine_shopId_name_idx" ON "Medicine"("shopId", "name");
CREATE INDEX "Medicine_shopId_company_idx" ON "Medicine"("shopId", "company");
CREATE INDEX "Medicine_shopId_barcode_idx" ON "Medicine"("shopId", "barcode");
CREATE UNIQUE INDEX "Medicine_shopId_barcode_key" ON "Medicine"("shopId", "barcode");
CREATE TABLE "new_Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATETIME NOT NULL,
    "gstType" TEXT NOT NULL DEFAULT 'GST',
    "paymentType" TEXT NOT NULL DEFAULT 'CASH',
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL NOT NULL DEFAULT 0,
    "gstTotal" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Purchase_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Purchase" ("createdAt", "id", "invoiceDate", "invoiceNumber", "shopId", "supplierId", "totalAmount", "updatedAt") SELECT "createdAt", "id", "invoiceDate", "invoiceNumber", "shopId", "supplierId", "totalAmount", "updatedAt" FROM "Purchase";
DROP TABLE "Purchase";
ALTER TABLE "new_Purchase" RENAME TO "Purchase";
CREATE INDEX "Purchase_shopId_supplierId_idx" ON "Purchase"("shopId", "supplierId");
CREATE INDEX "Purchase_shopId_idx" ON "Purchase"("shopId");
CREATE UNIQUE INDEX "Purchase_shopId_invoiceNumber_key" ON "Purchase"("shopId", "invoiceNumber");
CREATE TABLE "new_PurchaseItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "freeQty" INTEGER NOT NULL DEFAULT 0,
    "scheme" TEXT,
    "purchaseRate" DECIMAL NOT NULL,
    "mrp" DECIMAL NOT NULL,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "gst" DECIMAL NOT NULL DEFAULT 0,
    "expiryDate" DATETIME NOT NULL,
    CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseItem_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PurchaseItem" ("batchId", "expiryDate", "id", "medicineId", "mrp", "purchaseId", "purchaseRate", "quantity") SELECT "batchId", "expiryDate", "id", "medicineId", "mrp", "purchaseId", "purchaseRate", "quantity" FROM "PurchaseItem";
DROP TABLE "PurchaseItem";
ALTER TABLE "new_PurchaseItem" RENAME TO "PurchaseItem";
CREATE INDEX "PurchaseItem_purchaseId_idx" ON "PurchaseItem"("purchaseId");
CREATE INDEX "PurchaseItem_batchId_idx" ON "PurchaseItem"("batchId");
CREATE TABLE "new_ShopSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "shopName" TEXT NOT NULL DEFAULT '',
    "addressLine1" TEXT NOT NULL DEFAULT '',
    "addressLine2" TEXT,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "gstin" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShopSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ShopSettings" ("addressLine1", "addressLine2", "createdAt", "email", "gstin", "id", "phone", "shopId", "shopName", "updatedAt") SELECT "addressLine1", "addressLine2", "createdAt", "email", "gstin", "id", "phone", "shopId", "shopName", "updatedAt" FROM "ShopSettings";
DROP TABLE "ShopSettings";
ALTER TABLE "new_ShopSettings" RENAME TO "ShopSettings";
CREATE UNIQUE INDEX "ShopSettings_shopId_key" ON "ShopSettings"("shopId");
CREATE INDEX "ShopSettings_shopId_idx" ON "ShopSettings"("shopId");
CREATE TABLE "new_StockLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "referenceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockLedger_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockLedger_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockLedger_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StockLedger" ("batchId", "createdAt", "id", "medicineId", "qty", "referenceId", "shopId", "type") SELECT "batchId", "createdAt", "id", "medicineId", "qty", "referenceId", "shopId", "type" FROM "StockLedger";
DROP TABLE "StockLedger";
ALTER TABLE "new_StockLedger" RENAME TO "StockLedger";
CREATE INDEX "StockLedger_shopId_createdAt_idx" ON "StockLedger"("shopId", "createdAt");
CREATE INDEX "StockLedger_medicineId_idx" ON "StockLedger"("medicineId");
CREATE INDEX "StockLedger_batchId_idx" ON "StockLedger"("batchId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Company_shopId_idx" ON "Company"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_shopId_name_key" ON "Company"("shopId", "name");

-- CreateIndex
CREATE INDEX "ImportJob_createdAt_idx" ON "ImportJob"("createdAt");
