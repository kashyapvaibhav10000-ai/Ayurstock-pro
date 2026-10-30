-- Purchase history: source (INVOICE / AI_IMPORT / MANUAL), entered-by user,
-- and stored original invoice files for AI imports. Additive only.

-- CreateEnum
CREATE TYPE "PurchaseSource" AS ENUM ('INVOICE', 'AI_IMPORT', 'MANUAL');

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "documentId" TEXT,
ADD COLUMN     "source" "PurchaseSource" NOT NULL DEFAULT 'INVOICE';

-- CreateTable
CREATE TABLE "PurchaseDocument" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseDocument_shopId_createdAt_idx" ON "PurchaseDocument"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_documentId_key" ON "Purchase"("documentId");

-- CreateIndex
CREATE INDEX "Purchase_shopId_invoiceDate_idx" ON "Purchase"("shopId", "invoiceDate");

-- CreateIndex
CREATE INDEX "Purchase_shopId_source_idx" ON "Purchase"("shopId", "source");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "PurchaseDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDocument" ADD CONSTRAINT "PurchaseDocument_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

