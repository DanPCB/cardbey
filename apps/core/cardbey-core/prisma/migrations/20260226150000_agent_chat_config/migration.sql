-- CreateTable
CREATE TABLE "AgentChatConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "useResearchAgent" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentChatConfig_missionId_key" ON "AgentChatConfig"("missionId");

-- CreateIndex
CREATE INDEX "AgentChatConfig_missionId_idx" ON "AgentChatConfig"("missionId");
