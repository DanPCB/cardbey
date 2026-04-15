-- CreateTable: reward model for orchestrator runs (tool completeness + outcome quality)
CREATE TABLE "OrchestratorRunReward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orchestratorTaskId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "toolCompletenessScore" REAL NOT NULL,
    "outcomeQualityScore" REAL NOT NULL,
    "overallReward" REAL NOT NULL,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "OrchestratorRunReward_orchestratorTaskId_idx" ON "OrchestratorRunReward"("orchestratorTaskId");
CREATE INDEX "OrchestratorRunReward_missionId_idx" ON "OrchestratorRunReward"("missionId");
CREATE INDEX "OrchestratorRunReward_tenantId_idx" ON "OrchestratorRunReward"("tenantId");
CREATE INDEX "OrchestratorRunReward_createdAt_idx" ON "OrchestratorRunReward"("createdAt");
