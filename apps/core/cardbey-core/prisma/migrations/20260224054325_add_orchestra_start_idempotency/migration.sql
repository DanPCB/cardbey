-- CreateTable
CREATE TABLE "OrchestraStartIdempotency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "responseBody" JSONB,
    "correlationId" TEXT,
    "orchestratorTaskId" TEXT,
    "errorSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "OrchestraStartIdempotency_keyHash_key" ON "OrchestraStartIdempotency"("keyHash");

-- CreateIndex
CREATE INDEX "OrchestraStartIdempotency_keyHash_idx" ON "OrchestraStartIdempotency"("keyHash");

-- CreateIndex
CREATE INDEX "OrchestraStartIdempotency_expiresAt_idx" ON "OrchestraStartIdempotency"("expiresAt");

-- CreateIndex
CREATE INDEX "OrchestraStartIdempotency_status_idx" ON "OrchestraStartIdempotency"("status");
