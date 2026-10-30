-- Batch identity = (shopId, medicineId, batchNumber, expiryDate).
-- The same batch number with a different expiry is a separate batch.

-- Normalize stored expiries to the last day of the month (00:00 UTC), the
-- same rule as lib/batch.ts normalizeExpiry(). The +12h shift keeps
-- local-midnight values serialized from IST (18:30 the previous day UTC) in
-- the intended month. The old unique key (without expiry) guarantees this
-- cannot create duplicates under the new key.
UPDATE "InventoryBatch"
SET "expiryDate" = date_trunc('month', "expiryDate" + interval '12 hours') + interval '1 month' - interval '1 day';

UPDATE "PurchaseItem"
SET "expiryDate" = date_trunc('month', "expiryDate" + interval '12 hours') + interval '1 month' - interval '1 day';

UPDATE "MedicineReturn"
SET "expiryDate" = date_trunc('month', "expiryDate" + interval '12 hours') + interval '1 month' - interval '1 day';

-- DropIndex
DROP INDEX IF EXISTS "InventoryBatch_shopId_medicineId_batchNumber_key";

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBatch_shopId_medicineId_batchNumber_expiryDate_key" ON "InventoryBatch"("shopId", "medicineId", "batchNumber", "expiryDate");
