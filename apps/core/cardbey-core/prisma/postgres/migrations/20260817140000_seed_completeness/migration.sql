-- Additive seed completeness columns + curation audit (no drops)

ALTER TABLE "business_seed" ADD COLUMN IF NOT EXISTS "completenessTier" TEXT;
ALTER TABLE "business_seed" ADD COLUMN IF NOT EXISTS "completenessScore" INTEGER;
ALTER TABLE "business_seed" ADD COLUMN IF NOT EXISTS "completenessBlockers" TEXT;
ALTER TABLE "business_seed" ADD COLUMN IF NOT EXISTS "completenessGaps" TEXT;
ALTER TABLE "business_seed" ADD COLUMN IF NOT EXISTS "completenessCheckedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "seed_curation_events" (
    "id" TEXT NOT NULL,
    "seedId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "note" TEXT,
    "previousValue" TEXT NOT NULL DEFAULT 'null',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "seed_curation_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "seed_curation_events_seedId_idx" ON "seed_curation_events"("seedId");
CREATE INDEX IF NOT EXISTS "seed_curation_events_createdAt_idx" ON "seed_curation_events"("createdAt");
