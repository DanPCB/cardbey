-- Bidding / matching + learning layer: AgentTask, AgentProfile, Bid, Assignment, InteractionFeedback

CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "userMessageId" TEXT,
    "type" TEXT NOT NULL,
    "payload" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "AgentTask_missionId_createdAt_idx" ON "AgentTask"("missionId", "createdAt");
CREATE INDEX "AgentTask_status_idx" ON "AgentTask"("status");
CREATE INDEX "AgentTask_type_idx" ON "AgentTask"("type");

CREATE TABLE "AgentProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentKey" TEXT NOT NULL,
    "skills" TEXT,
    "baseQuality" REAL NOT NULL DEFAULT 0.8,
    "baseCost" REAL NOT NULL DEFAULT 1,
    "baseLatency" INTEGER NOT NULL DEFAULT 5000,
    "reliabilityScore" REAL NOT NULL DEFAULT 0.8,
    "maxConcurrency" INTEGER NOT NULL DEFAULT 5,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "AgentProfile_agentKey_key" ON "AgentProfile"("agentKey");
CREATE INDEX "AgentProfile_agentKey_idx" ON "AgentProfile"("agentKey");

CREATE TABLE "Bid" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "components" TEXT,
    "rationale" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bid_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Bid_taskId_agentKey_key" ON "Bid"("taskId", "agentKey");
CREATE INDEX "Bid_taskId_idx" ON "Bid"("taskId");
CREATE INDEX "Bid_agentKey_idx" ON "Bid"("agentKey");

CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "agentRunId" TEXT,
    "matchedScore" REAL NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "success" INTEGER,
    "metrics" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Assignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Assignment_agentRunId_key" ON "Assignment"("agentRunId");
CREATE INDEX "Assignment_taskId_idx" ON "Assignment"("taskId");
CREATE INDEX "Assignment_agentKey_idx" ON "Assignment"("agentKey");
CREATE INDEX "Assignment_agentRunId_idx" ON "Assignment"("agentRunId");
CREATE INDEX "Assignment_assignedAt_idx" ON "Assignment"("assignedAt");

CREATE TABLE "InteractionFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "userMessageId" TEXT,
    "assignmentId" TEXT NOT NULL,
    "userRating" TEXT,
    "systemQualityScore" REAL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InteractionFeedback_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "InteractionFeedback_missionId_idx" ON "InteractionFeedback"("missionId");
CREATE INDEX "InteractionFeedback_assignmentId_idx" ON "InteractionFeedback"("assignmentId");
