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
    CONSTRAINT "MiArtifact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MiGenerationJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MiArtifact_jobId_stageKey_fkey" FOREIGN KEY ("jobId", "stageKey") REFERENCES "MiStage" ("jobId", "stageKey") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MiArtifact" ("createdAt", "id", "jobId", "payloadJson", "provenanceAgent", "stageKey", "type", "updatedAt") SELECT "createdAt", "id", "jobId", "payloadJson", "provenanceAgent", "stageKey", "type", "updatedAt" FROM "MiArtifact";
DROP TABLE "MiArtifact";
ALTER TABLE "new_MiArtifact" RENAME TO "MiArtifact";
CREATE INDEX "MiArtifact_jobId_type_idx" ON "MiArtifact"("jobId", "type");
CREATE INDEX "MiArtifact_jobId_stageKey_idx" ON "MiArtifact"("jobId", "stageKey");
CREATE INDEX "MiArtifact_stageKey_idx" ON "MiArtifact"("stageKey");
CREATE INDEX "MiArtifact_type_idx" ON "MiArtifact"("type");
CREATE INDEX "MiArtifact_createdAt_idx" ON "MiArtifact"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
