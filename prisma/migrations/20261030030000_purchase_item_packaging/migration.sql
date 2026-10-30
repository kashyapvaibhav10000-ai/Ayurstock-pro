-- Packaging on purchase lines. Additive: existing rows get unitsPerPack = 1.

-- CreateEnum
CREATE TYPE "PackType" AS ENUM ('BOX', 'STRIP', 'BOTTLE', 'JAR', 'PACKET', 'LOOSE');

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "packType" "PackType",
ADD COLUMN     "pricePerPack" DECIMAL(65,30),
ADD COLUMN     "unitsPerPack" INTEGER NOT NULL DEFAULT 1;

