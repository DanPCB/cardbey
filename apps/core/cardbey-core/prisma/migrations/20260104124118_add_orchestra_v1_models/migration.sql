-- SQLite doesn't support enums natively, Prisma stores them as TEXT
-- Enum values are: QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED (MiJobStatus)
-- Enum values are: PENDING, READY, RUNNING, COMPLETED, FAILED, SKIPPED (MiStageStatus)
-- Enum values are: TEXT, IMAGE, VIDEO, AUDIO, DOCUMENT, DATA, CODE, CONFIG, OTHER (MiArtifactType)
-- Enum values are: OK, NEEDS_REVIEW, BLOCKED (MiArtifactStatus)

-- CreateTable
CREATE TABLE "MiIntent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "rawInput" TEXT NOT NULL,
    "businessTypeHint" TEXT,
    "inputsJson" TEXT NOT NULL,
    "constraintsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MiJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "intentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "currentStage" TEXT,
    "progress" REAL NOT NULL DEFAULT 0.0,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MiJob_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "MiIntent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MiStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dependsOnJson" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MiStage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MiJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MiArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "stageId" TEXT,
    "type" TEXT NOT NULL,
    "contentJson" TEXT NOT NULL,
    "expectedTagsJson" TEXT,
    "semanticTagsJson" TEXT,
    "matchScore" REAL,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "provenanceAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MiArtifact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MiJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MiArtifact_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "MiStage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MiIntent_userId_idx" ON "MiIntent"("userId");

-- CreateIndex
CREATE INDEX "MiIntent_createdAt_idx" ON "MiIntent"("createdAt");

-- CreateIndex
CREATE INDEX "MiJob_intentId_idx" ON "MiJob"("intentId");

-- CreateIndex
CREATE INDEX "MiJob_status_idx" ON "MiJob"("status");

-- CreateIndex
CREATE INDEX "MiJob_currentStage_idx" ON "MiJob"("currentStage");

-- CreateIndex
CREATE INDEX "MiJob_createdAt_idx" ON "MiJob"("createdAt");

-- CreateIndex
CREATE INDEX "MiStage_jobId_idx" ON "MiStage"("jobId");

-- CreateIndex
CREATE INDEX "MiStage_jobId_name_idx" ON "MiStage"("jobId", "name");

-- CreateIndex
CREATE INDEX "MiStage_status_idx" ON "MiStage"("status");

-- CreateIndex
CREATE INDEX "MiStage_createdAt_idx" ON "MiStage"("createdAt");

-- CreateIndex
CREATE INDEX "MiArtifact_jobId_idx" ON "MiArtifact"("jobId");

-- CreateIndex
CREATE INDEX "MiArtifact_stageId_idx" ON "MiArtifact"("stageId");

-- CreateIndex
CREATE INDEX "MiArtifact_type_idx" ON "MiArtifact"("type");

-- CreateIndex
CREATE INDEX "MiArtifact_status_idx" ON "MiArtifact"("status");

-- CreateIndex
CREATE INDEX "MiArtifact_createdAt_idx" ON "MiArtifact"("createdAt");

