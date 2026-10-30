-- Super-admin managed AI provider keys (encrypted) and their audit log.

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('GEMINI', 'GROQ', 'MISTRAL', 'OPENROUTER');

-- CreateTable
CREATE TABLE "AiProviderKey" (
    "id" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "encryptedKey" TEXT,
    "iv" TEXT,
    "authTag" TEXT,
    "last4" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastLatencyMs" INTEGER,
    "lastError" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiKeyAuditLog" (
    "id" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "userId" TEXT,
    "userEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiKeyAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderKey_provider_key" ON "AiProviderKey"("provider");

-- CreateIndex
CREATE INDEX "AiKeyAuditLog_createdAt_idx" ON "AiKeyAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AiKeyAuditLog_provider_createdAt_idx" ON "AiKeyAuditLog"("provider", "createdAt");

