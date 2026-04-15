-- CreateTable
CREATE TABLE "MiGenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "storeId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceValue" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "resultJson" JSONB,
    "errorJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "MiGenerationJob_tenantId_idx" ON "MiGenerationJob"("tenantId");

-- CreateIndex
CREATE INDEX "MiGenerationJob_storeId_idx" ON "MiGenerationJob"("storeId");

-- CreateIndex
CREATE INDEX "MiGenerationJob_status_idx" ON "MiGenerationJob"("status");

-- CreateIndex
CREATE INDEX "MiGenerationJob_sourceType_idx" ON "MiGenerationJob"("sourceType");

-- CreateIndex
CREATE INDEX "MiGenerationJob_createdAt_idx" ON "MiGenerationJob"("createdAt");

