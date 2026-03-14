PRAGMA foreign_keys=off;

CREATE TABLE "new_InventoryBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "expiryDate" DATETIME NOT NULL,
    "stockQty" INTEGER NOT NULL DEFAULT 0 CHECK (stockQty >= 0),
    "mrp" DECIMAL NOT NULL,
    "purchaseRate" DECIMAL NOT NULL,
    "sellingRate" DECIMAL NOT NULL,
    "rackLocation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryBatch_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryBatch_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_InventoryBatch" (
  "id",
  "shopId",
  "medicineId",
  "batchNumber",
  "expiryDate",
  "stockQty",
  "mrp",
  "purchaseRate",
  "sellingRate",
  "rackLocation",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "shopId",
  "medicineId",
  "batchNumber",
  "expiryDate",
  CASE WHEN "stockQty" < 0 THEN 0 ELSE "stockQty" END,
  "mrp",
  "purchaseRate",
  "sellingRate",
  "rackLocation",
  "createdAt",
  "updatedAt"
FROM "InventoryBatch";

DROP TABLE "InventoryBatch";

ALTER TABLE "new_InventoryBatch" RENAME TO "InventoryBatch";

CREATE UNIQUE INDEX "InventoryBatch_shopId_medicineId_batchNumber_key" ON "InventoryBatch"("shopId", "medicineId", "batchNumber");
CREATE INDEX "InventoryBatch_shopId_medicineId_expiryDate_idx" ON "InventoryBatch"("shopId", "medicineId", "expiryDate");
CREATE INDEX "InventoryBatch_shopId_medicineId_idx" ON "InventoryBatch"("shopId", "medicineId");
CREATE INDEX "InventoryBatch_expiryDate_idx" ON "InventoryBatch"("expiryDate");
CREATE INDEX "InventoryBatch_medicineId_idx" ON "InventoryBatch"("medicineId");

PRAGMA foreign_keys=on;
