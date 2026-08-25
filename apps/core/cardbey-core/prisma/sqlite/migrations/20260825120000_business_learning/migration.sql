-- Additive: multi-agent mission learnings (no Business/Seed/User writes).
CREATE TABLE IF NOT EXISTS "BusinessLearning" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "briefSummary" TEXT,
    "issues" TEXT,
    "learnedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "BusinessLearning_storeId_capability_idx" ON "BusinessLearning"("storeId", "capability");
CREATE INDEX IF NOT EXISTS "BusinessLearning_storeId_learnedAt_idx" ON "BusinessLearning"("storeId", "learnedAt");
CREATE INDEX IF NOT EXISTS "BusinessLearning_missionId_idx" ON "BusinessLearning"("missionId");
