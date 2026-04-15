-- CreateTable: LlmUsageDaily (LLM budget guard v1 – per-tenant daily caps)
CREATE TABLE "LlmUsageDaily" (
    "id" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "day" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LlmUsageDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LlmUsageDaily_key" ON "LlmUsageDaily"("tenantKey", "purpose", "provider", "model", "day");
CREATE INDEX "LlmUsageDaily_tenantKey_day_idx" ON "LlmUsageDaily"("tenantKey", "day");
CREATE INDEX "LlmUsageDaily_day_idx" ON "LlmUsageDaily"("day");
