-- Customer B2B fields (idempotent / safe to run on a db-push-managed DB).
-- Adds Drug License and PAN so wholesale/B2B sales can capture the buyer's
-- full compliance details in addition to the existing address and GSTIN.

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "drugLicense" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "pan" TEXT NOT NULL DEFAULT '';
