/*
  Warnings:

  - You are about to drop the column `contentJson` on the `MiArtifact` table. All the data in the column will be lost.
  - You are about to drop the column `expectedTagsJson` on the `MiArtifact` table. All the data in the column will be lost.
  - You are about to drop the column `matchScore` on the `MiArtifact` table. All the data in the column will be lost.
  - You are about to drop the column `semanticTagsJson` on the `MiArtifact` table. All the data in the column will be lost.
  - You are about to drop the column `stageId` on the `MiArtifact` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `MiArtifact` table. All the data in the column will be lost.
  - You are about to drop the column `completedAt` on the `MiStage` table. All the data in the column will be lost.
  - You are about to drop the column `errorJson` on the `MiStage` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `MiStage` table. All the data in the column will be lost.
  - You are about to drop the column `resultJson` on the `MiStage` table. All the data in the column will be lost.
  - Added the required column `stageKey` to the `MiStage` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MiArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "stageKey" TEXT,
    "type" TEXT NOT NULL,
    "payloadJson" JSONB,
    "provenanceAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MiArtifact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MiGenerationJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MiArtifact" ("createdAt", "id", "jobId", "provenanceAgent", "type", "updatedAt") SELECT "createdAt", "id", "jobId", "provenanceAgent", "type", "updatedAt" FROM "MiArtifact";
DROP TABLE "MiArtifact";
ALTER TABLE "new_MiArtifact" RENAME TO "MiArtifact";
CREATE INDEX "MiArtifact_jobId_type_idx" ON "MiArtifact"("jobId", "type");
CREATE INDEX "MiArtifact_jobId_stageKey_idx" ON "MiArtifact"("jobId", "stageKey");
CREATE INDEX "MiArtifact_stageKey_idx" ON "MiArtifact"("stageKey");
CREATE INDEX "MiArtifact_type_idx" ON "MiArtifact"("type");
CREATE INDEX "MiArtifact_createdAt_idx" ON "MiArtifact"("createdAt");
CREATE TABLE "new_MiStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "stageKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "mode" TEXT,
    "dependsOnJson" JSONB,
    "outputJson" JSONB,
    "error" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MiStage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MiGenerationJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MiStage" ("createdAt", "dependsOnJson", "id", "jobId", "startedAt", "status", "updatedAt") SELECT "createdAt", "dependsOnJson", "id", "jobId", "startedAt", "status", "updatedAt" FROM "MiStage";
DROP TABLE "MiStage";
ALTER TABLE "new_MiStage" RENAME TO "MiStage";
CREATE INDEX "MiStage_jobId_idx" ON "MiStage"("jobId");
CREATE INDEX "MiStage_jobId_status_idx" ON "MiStage"("jobId", "status");
CREATE INDEX "MiStage_jobId_stageKey_idx" ON "MiStage"("jobId", "stageKey");
CREATE INDEX "MiStage_stageKey_idx" ON "MiStage"("stageKey");
CREATE INDEX "MiStage_createdAt_idx" ON "MiStage"("createdAt");
CREATE UNIQUE INDEX "MiStage_jobId_stageKey_key" ON "MiStage"("jobId", "stageKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
