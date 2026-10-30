-- Append-only stock ledger (StockMovement).

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE', 'MANUAL_ADD', 'SALE', 'WHOLESALE_SALE', 'RETURN', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT', 'DELETE', 'RESTORE');
-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "qtyChange" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "note" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "StockMovement_shopId_createdAt_idx" ON "StockMovement"("shopId", "createdAt");
-- CreateIndex
CREATE INDEX "StockMovement_shopId_medicineId_idx" ON "StockMovement"("shopId", "medicineId");
-- CreateIndex
CREATE INDEX "StockMovement_batchId_idx" ON "StockMovement"("batchId");
-- CreateIndex
CREATE INDEX "StockMovement_shopId_type_idx" ON "StockMovement"("shopId", "type");
-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Append-only: rows may be inserted (and removed by cascade when a shop,
-- medicine or batch is hard-deleted) but never modified.
CREATE OR REPLACE FUNCTION stock_movement_block_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'StockMovement is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockMovement_no_update"
BEFORE UPDATE ON "StockMovement"
FOR EACH ROW EXECUTE FUNCTION stock_movement_block_update();
