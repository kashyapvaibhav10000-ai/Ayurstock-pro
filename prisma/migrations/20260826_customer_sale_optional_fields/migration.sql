-- Customer fields used by sale creation/invoice printing.
-- This is intentionally idempotent because some existing databases were
-- initialized from the original schema and missed one or more later columns.

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "gstin" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "drugLicense" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "pan" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isWholesale" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Customer" ALTER COLUMN "phone" SET DEFAULT '';
ALTER TABLE "Customer" ALTER COLUMN "address" SET DEFAULT '';
