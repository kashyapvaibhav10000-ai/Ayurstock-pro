-- AI provider instances (adapter/model/baseUrl), per-call usage log with
-- feature tags, and optional per-feature provider order. Additive: existing
-- rows become instances of their original provider and keep their keys.

-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('INVOICE_IMPORT', 'MEDICINE_IMPORT', 'MEDICINE_BATCH_REPARSE');

-- AlterTable
ALTER TABLE "AiProviderKey"
    ADD COLUMN "adapter" TEXT,
    ADD COLUMN "displayName" TEXT,
    ADD COLUMN "model" TEXT,
    ADD COLUMN "baseUrl" TEXT;

UPDATE "AiProviderKey" SET "adapter" = "provider"::text WHERE "adapter" IS NULL;

-- Every original provider gets an instance row, so .env-only providers keep
-- their card and their slot (rank matches the old default for missing rows).
INSERT INTO "AiProviderKey" ("id", "provider", "adapter", "enabled", "priority", "updatedAt")
SELECT 'legacy_' || lower(v.p::text), v.p, v.p::text, true, 1000 + v.ord, CURRENT_TIMESTAMP
FROM (VALUES ('GEMINI'::"AiProvider", 0), ('MISTRAL'::"AiProvider", 1), ('GROQ'::"AiProvider", 2), ('OPENROUTER'::"AiProvider", 3)) AS v(p, ord)
WHERE NOT EXISTS (SELECT 1 FROM "AiProviderKey" k WHERE k."provider" = v.p);

ALTER TABLE "AiProviderKey" ALTER COLUMN "adapter" SET NOT NULL;
ALTER TABLE "AiProviderKey" ALTER COLUMN "provider" DROP NOT NULL;

-- AlterTable
ALTER TABLE "AiKeyAuditLog"
    ALTER COLUMN "provider" DROP NOT NULL,
    ADD COLUMN "instanceId" TEXT,
    ADD COLUMN "instanceName" TEXT;

-- CreateTable
CREATE TABLE "AiCallLog" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "instanceId" TEXT,
    "adapter" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "model" TEXT,
    "success" BOOLEAN NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "error" TEXT,
    "shopId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiFeatureRoute" (
    "feature" "AiFeature" NOT NULL,
    "instanceIds" TEXT[],
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiFeatureRoute_pkey" PRIMARY KEY ("feature")
);

-- CreateIndex
CREATE INDEX "AiCallLog_createdAt_idx" ON "AiCallLog"("createdAt");

-- CreateIndex
CREATE INDEX "AiCallLog_feature_createdAt_idx" ON "AiCallLog"("feature", "createdAt");

-- CreateIndex
CREATE INDEX "AiCallLog_instanceId_createdAt_idx" ON "AiCallLog"("instanceId", "createdAt");
