-- CreateTable
CREATE TABLE "PublishIdempotency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyHash" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'publish',
    "status" TEXT NOT NULL,
    "responseBody" JSONB,
    "correlationId" TEXT,
    "storeId" TEXT,
    "draftId" TEXT,
    "requestHash" TEXT,
    "errorSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PublishIdempotency_keyHash_key" ON "PublishIdempotency"("keyHash");

-- CreateIndex
CREATE INDEX "PublishIdempotency_keyHash_idx" ON "PublishIdempotency"("keyHash");

-- CreateIndex
CREATE INDEX "PublishIdempotency_expiresAt_idx" ON "PublishIdempotency"("expiresAt");

-- CreateIndex
CREATE INDEX "PublishIdempotency_status_idx" ON "PublishIdempotency"("status");
