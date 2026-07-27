-- AlterTable: LlmCache v1 (tenant-scoped + TTL + access tracking)
-- Add columns (existing rows get defaults), replace unique constraint and indexes.

ALTER TABLE "LlmCache" ADD COLUMN "tenantKey" TEXT NOT NULL DEFAULT 'global';
ALTER TABLE "LlmCache" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'llm';
ALTER TABLE "LlmCache" ADD COLUMN "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '14 days');
ALTER TABLE "LlmCache" ADD COLUMN "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "LlmCache" ADD COLUMN "hitCount" INTEGER NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS "LlmCache_promptHash_provider_model_key";
DROP INDEX IF EXISTS "LlmCache_promptHash_idx";

CREATE UNIQUE INDEX "LlmCache_key" ON "LlmCache"("tenantKey", "purpose", "promptHash", "provider", "model");
CREATE INDEX "LlmCache_expiresAt_idx" ON "LlmCache"("expiresAt");
CREATE INDEX "LlmCache_tenantKey_expiresAt_idx" ON "LlmCache"("tenantKey", "expiresAt");
CREATE INDEX "LlmCache_tenantKey_lastAccessedAt_idx" ON "LlmCache"("tenantKey", "lastAccessedAt");

ALTER TABLE "LlmCache" ALTER COLUMN "expiresAt" DROP DEFAULT;
ALTER TABLE "LlmCache" ALTER COLUMN "tenantKey" DROP DEFAULT;
ALTER TABLE "LlmCache" ALTER COLUMN "purpose" DROP DEFAULT;
