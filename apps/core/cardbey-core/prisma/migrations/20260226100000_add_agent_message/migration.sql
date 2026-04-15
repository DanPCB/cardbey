-- CreateTable: multi-agent communication layer (user vs AI vs agents)
CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "visibleToUser" INTEGER NOT NULL DEFAULT 1,
    "channel" TEXT NOT NULL,
    "performative" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT,
    CONSTRAINT "AgentMessage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "OrchestratorTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AgentMessage_missionId_idx" ON "AgentMessage"("missionId");
CREATE INDEX "AgentMessage_missionId_channel_idx" ON "AgentMessage"("missionId", "channel");
CREATE INDEX "AgentMessage_createdAt_idx" ON "AgentMessage"("createdAt");
CREATE INDEX "AgentMessage_taskId_idx" ON "AgentMessage"("taskId");
