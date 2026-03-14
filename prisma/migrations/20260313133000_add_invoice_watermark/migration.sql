-- Add columns for invoice watermark settings
ALTER TABLE "InvoiceSettings" ADD COLUMN "watermarkText" TEXT NOT NULL DEFAULT '';
ALTER TABLE "InvoiceSettings" ADD COLUMN "watermarkEnabled" BOOLEAN NOT NULL DEFAULT 1;
