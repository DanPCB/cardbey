-- Discovery Engine V1 job audit trail

CREATE TABLE IF NOT EXISTS "discovery_engine_job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "region" TEXT,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "recordsFound" INTEGER NOT NULL DEFAULT 0,
    "recordsAccepted" INTEGER NOT NULL DEFAULT 0,
    "recordsRejected" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "error" TEXT,
    "paramsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "discovery_engine_job_provider_idx" ON "discovery_engine_job"("provider");
CREATE INDEX IF NOT EXISTS "discovery_engine_job_status_idx" ON "discovery_engine_job"("status");
CREATE INDEX IF NOT EXISTS "discovery_engine_job_startedAt_idx" ON "discovery_engine_job"("startedAt");

-- Business ingestion / discovery seeds (Postgres-durable)

CREATE TABLE IF NOT EXISTS "business_seed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'seeded_pending_qa',
    "name" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "rawPayload" TEXT NOT NULL DEFAULT '{}',
    "dedupeKey" TEXT NOT NULL,
    "storeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "business_seed_dedupeKey_key" ON "business_seed"("dedupeKey");
CREATE INDEX IF NOT EXISTS "business_seed_status_idx" ON "business_seed"("status");
CREATE INDEX IF NOT EXISTS "business_seed_source_idx" ON "business_seed"("source");
CREATE INDEX IF NOT EXISTS "business_seed_storeId_idx" ON "business_seed"("storeId");
