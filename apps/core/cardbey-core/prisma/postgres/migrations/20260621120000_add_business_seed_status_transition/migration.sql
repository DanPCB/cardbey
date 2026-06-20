-- Governed BusinessSeed lifecycle transition audit

CREATE TABLE IF NOT EXISTS "business_seed_status_transition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seedId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "lifecycleStage" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'system',
    "reason" TEXT,
    "claimRequestId" TEXT,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "business_seed_status_transition_seedId_idx" ON "business_seed_status_transition"("seedId");
CREATE INDEX IF NOT EXISTS "business_seed_status_transition_lifecycleStage_idx" ON "business_seed_status_transition"("lifecycleStage");
CREATE INDEX IF NOT EXISTS "business_seed_status_transition_createdAt_idx" ON "business_seed_status_transition"("createdAt");
