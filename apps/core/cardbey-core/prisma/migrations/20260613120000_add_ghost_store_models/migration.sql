-- Ghost store provenance, claims, reports, enrichment provenance.

ALTER TABLE "Business" ADD COLUMN "provenance" TEXT DEFAULT 'owner';
ALTER TABLE "Business" ADD COLUMN "claimStatus" TEXT;
ALTER TABLE "Business" ADD COLUMN "captureCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Business" ADD COLUMN "capturedByUserId" TEXT;

CREATE TABLE IF NOT EXISTS "GhostStoreClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "claimantName" TEXT NOT NULL,
    "claimantEmail" TEXT NOT NULL,
    "claimantPhone" TEXT,
    "claimantRole" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewerNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME
);
CREATE INDEX IF NOT EXISTS "GhostStoreClaim_storeId_idx" ON "GhostStoreClaim"("storeId");
CREATE INDEX IF NOT EXISTS "GhostStoreClaim_status_idx" ON "GhostStoreClaim"("status");
CREATE INDEX IF NOT EXISTS "GhostStoreClaim_claimantEmail_idx" ON "GhostStoreClaim"("claimantEmail");

CREATE TABLE IF NOT EXISTS "GhostStoreReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "GhostStoreReport_storeId_idx" ON "GhostStoreReport"("storeId");
CREATE INDEX IF NOT EXISTS "GhostStoreReport_status_idx" ON "GhostStoreReport"("status");

CREATE TABLE IF NOT EXISTS "EnrichedFieldProvenance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "EnrichedFieldProvenance_storeId_idx" ON "EnrichedFieldProvenance"("storeId");
CREATE INDEX IF NOT EXISTS "EnrichedFieldProvenance_fieldPath_idx" ON "EnrichedFieldProvenance"("fieldPath");
