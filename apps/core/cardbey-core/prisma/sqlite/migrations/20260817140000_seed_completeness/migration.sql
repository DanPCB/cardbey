-- Additive seed completeness columns + curation audit (SQLite)

ALTER TABLE "business_seed" ADD COLUMN "completenessTier" TEXT;
ALTER TABLE "business_seed" ADD COLUMN "completenessScore" INTEGER;
ALTER TABLE "business_seed" ADD COLUMN "completenessBlockers" TEXT;
ALTER TABLE "business_seed" ADD COLUMN "completenessGaps" TEXT;
ALTER TABLE "business_seed" ADD COLUMN "completenessCheckedAt" DATETIME;

CREATE TABLE IF NOT EXISTS "seed_curation_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seedId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "note" TEXT,
    "previousValue" TEXT NOT NULL DEFAULT 'null',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "seed_curation_events_seedId_idx" ON "seed_curation_events"("seedId");
CREATE INDEX IF NOT EXISTS "seed_curation_events_createdAt_idx" ON "seed_curation_events"("createdAt");
