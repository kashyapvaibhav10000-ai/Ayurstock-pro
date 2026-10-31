-- Failed logins that match no user (unknown username/email) and wrong POS
-- PINs are recorded too: userId becomes optional, shopId set when known.

-- AlterTable
ALTER TABLE "LoginHistory" ADD COLUMN     "shopId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "LoginHistory_shopId_createdAt_idx" ON "LoginHistory"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "LoginHistory_createdAt_idx" ON "LoginHistory"("createdAt");

