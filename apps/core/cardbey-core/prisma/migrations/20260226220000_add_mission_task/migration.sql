-- MissionTask: executable tasks from planner plan_update (Next Steps)
CREATE TABLE "MissionTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sourceMessageId" TEXT NOT NULL,
    "chainId" TEXT,
    "suggestionId" TEXT,
    "agentKey" TEXT,
    "intent" TEXT,
    "risk" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "MissionTask_missionId_createdAt_idx" ON "MissionTask"("missionId", "createdAt");
