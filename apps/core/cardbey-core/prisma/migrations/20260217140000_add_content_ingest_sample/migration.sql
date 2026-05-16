-- CreateTable
CREATE TABLE "ContentIngestSample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generationRunId" TEXT,
    "jobId" TEXT,
    "draftId" TEXT,
    "sourceType" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "includeImages" BOOLEAN NOT NULL DEFAULT true,
    "templateKey" TEXT,
    "websiteDomain" TEXT,
    "vertical" TEXT,
    "rawInputSanitized" TEXT,
    "ocrTextSanitized" TEXT,
    "outputCatalog" TEXT NOT NULL,
    "meta" TEXT
);

-- CreateIndex
CREATE INDEX "ContentIngestSample_createdAt_idx" ON "ContentIngestSample"("createdAt");

-- CreateIndex
CREATE INDEX "ContentIngestSample_sourceType_idx" ON "ContentIngestSample"("sourceType");

-- CreateIndex
CREATE INDEX "ContentIngestSample_goal_idx" ON "ContentIngestSample"("goal");

-- CreateIndex
CREATE INDEX "ContentIngestSample_draftId_idx" ON "ContentIngestSample"("draftId");
