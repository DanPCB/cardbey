-- Business ingestion pipeline run history (Postgres-durable)

CREATE TABLE IF NOT EXISTS "business_ingestion_run" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "seedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" TEXT NOT NULL DEFAULT '[]',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "business_ingestion_run_source_idx" ON "business_ingestion_run"("source");
CREATE INDEX IF NOT EXISTS "business_ingestion_run_status_idx" ON "business_ingestion_run"("status");
CREATE INDEX IF NOT EXISTS "business_ingestion_run_startedAt_idx" ON "business_ingestion_run"("startedAt");
