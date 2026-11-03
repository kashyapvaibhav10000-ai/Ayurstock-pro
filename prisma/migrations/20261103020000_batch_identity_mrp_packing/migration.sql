-- Batch identity = (shopId, medicineId, batchNumber, expiryDate, mrp, packing).
-- The same batch number and expiry with a different MRP or packing is a
-- separate batch instead of being merged into the existing one.

-- Normalize stored values the same way services/inventory.ts does
-- (normalizeMrp / normalizePacking). The old unique key is a subset of the
-- new one, so this cannot create duplicates.
UPDATE "InventoryBatch" SET "packing" = '' WHERE "packing" IS NULL;
UPDATE "InventoryBatch" SET "packing" = btrim(regexp_replace("packing", '\s+', ' ', 'g'));
UPDATE "InventoryBatch" SET "mrp" = round("mrp", 2);

-- DropIndex
DROP INDEX "InventoryBatch_shopId_medicineId_batchNumber_expiryDate_key";

-- AlterTable
ALTER TABLE "InventoryBatch" ALTER COLUMN "packing" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBatch_shopId_medicineId_batchNumber_expiryDate_mrp_key" ON "InventoryBatch"("shopId", "medicineId", "batchNumber", "expiryDate", "mrp", "packing");
