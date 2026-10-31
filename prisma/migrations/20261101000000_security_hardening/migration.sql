-- Security hardening (audit phase 2):
--  * email unique across all shops (login and super-admin no longer ambiguous)
--  * hashed POS PINs, unique per shop; plaintext "pin" kept until
--    scripts/hash-pins.ts converts and clears it
--  * tokenVersion for session revocation
--  * paired POS devices and one-time pairing codes
--  * per-role max discount at billing

-- Emails are compared lowercase everywhere; store them that way first.
UPDATE "User" SET "email" = lower(trim("email")) WHERE "email" <> lower(trim("email"));

-- Fail with a readable message instead of a bare unique-violation.
DO $$
DECLARE dup TEXT;
BEGIN
  SELECT string_agg("email", ', ') INTO dup FROM (
    SELECT "email" FROM "User" GROUP BY "email" HAVING count(*) > 1
  ) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION 'Emails used by more than one user: %. Change them so each is unique, then re-run the migration.', dup;
  END IF;
END $$;

-- DropIndex
DROP INDEX "User_email_idx";

-- DropIndex
DROP INDEX "User_shopId_email_key";

-- AlterTable
ALTER TABLE "BillingSettings" ADD COLUMN     "maxDiscountPercentAdmin" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "maxDiscountPercentCashier" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "maxDiscountPercentManager" INTEGER NOT NULL DEFAULT 25;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pinHash" TEXT,
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PosDevice" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "pairedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pairedByUserId" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "failedPinCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "PosDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosPairingCode" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosPairingCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosDevice_tokenHash_key" ON "PosDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "PosDevice_shopId_idx" ON "PosDevice"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "PosPairingCode_codeHash_key" ON "PosPairingCode"("codeHash");

-- CreateIndex
CREATE INDEX "PosPairingCode_shopId_idx" ON "PosPairingCode"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_shopId_pinHash_key" ON "User"("shopId", "pinHash");

-- AddForeignKey
ALTER TABLE "PosDevice" ADD CONSTRAINT "PosDevice_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosPairingCode" ADD CONSTRAINT "PosPairingCode_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase" CHECK ("email" = lower("email"));

-- Per-shop daily AI cap (lib/ai/allowance.ts) counts by shop and day.
CREATE INDEX "AiCallLog_shopId_createdAt_idx" ON "AiCallLog"("shopId", "createdAt");
