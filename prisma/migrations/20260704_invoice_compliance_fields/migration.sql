-- Invoice compliance fields (idempotent / safe to run on a db-push-managed DB).
-- These columns are read by the invoice + settings code; if they are missing,
-- Prisma queries on ShopSettings / Customer fail and invoices won't load.

-- ShopSettings: Drug License, Place of Supply, and invoice terms
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "drugLicense" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "state" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "stateCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "invoiceTerms" TEXT NOT NULL DEFAULT '';

-- Customer: GSTIN (for wholesale/B2B invoices)
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "gstin" TEXT NOT NULL DEFAULT '';

-- StockAdjustment: userId index (relations were added at the ORM layer; the
-- index is safe and improves lookups). FKs are intentionally omitted here to
-- avoid failing on any pre-existing orphan rows on a drifted database.
CREATE INDEX IF NOT EXISTS "StockAdjustment_userId_idx" ON "StockAdjustment" ("userId");
