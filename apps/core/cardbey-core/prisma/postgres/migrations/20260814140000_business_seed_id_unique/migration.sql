-- Phase 6: Business.seedId uniqueness for concurrent claim hardening
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "seedId" TEXT;

CREATE INDEX IF NOT EXISTS "Business_seedId_idx" ON "Business"("seedId");

-- Partial unique: only one Business per non-null seedId
CREATE UNIQUE INDEX IF NOT EXISTS "Business_seedId_unique"
  ON "Business" ("seedId")
  WHERE "seedId" IS NOT NULL;
