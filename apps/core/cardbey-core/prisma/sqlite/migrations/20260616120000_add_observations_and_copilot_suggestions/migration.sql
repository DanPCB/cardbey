-- CreateTable
CREATE TABLE "observations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT,
    "intentType" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "error" TEXT,
    "latency" INTEGER,
    "tokensUsed" INTEGER,
    "cost" REAL,
    "confidence" REAL,
    "contextSnapshot" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "observations_missionId_idx" ON "observations"("missionId");
CREATE INDEX "observations_intentType_outcome_idx" ON "observations"("intentType", "outcome");
CREATE INDEX "observations_createdAt_idx" ON "observations"("createdAt");

-- CreateTable
CREATE TABLE "copilot_suggestions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "storeId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "urgency" TEXT NOT NULL DEFAULT 'medium',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "metadata" JSONB NOT NULL,
    "executedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "copilot_suggestions_userId_status_idx" ON "copilot_suggestions"("userId", "status");
CREATE INDEX "copilot_suggestions_status_priority_idx" ON "copilot_suggestions"("status", "priority");
CREATE INDEX "copilot_suggestions_createdAt_idx" ON "copilot_suggestions"("createdAt");
