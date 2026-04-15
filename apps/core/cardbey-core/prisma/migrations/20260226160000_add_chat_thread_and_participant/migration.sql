-- ChatThread: optional grouping for agent conversations (backwards-compatible with missionId-only flow)
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT,
    "title" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatThread_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ChatThreadParticipant: users or agents in a thread
CREATE TABLE "ChatThreadParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "participantType" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatThreadParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AgentMessage: optional thread link; existing behaviour by missionId unchanged
ALTER TABLE "AgentMessage" ADD COLUMN "threadId" TEXT;
-- SQLite does not support ADD CONSTRAINT in ALTER TABLE; relation is enforced by Prisma client.

CREATE INDEX "ChatThread_missionId_idx" ON "ChatThread"("missionId");
CREATE INDEX "ChatThread_createdByUserId_idx" ON "ChatThread"("createdByUserId");
CREATE INDEX "ChatThreadParticipant_threadId_idx" ON "ChatThreadParticipant"("threadId");
CREATE INDEX "ChatThreadParticipant_threadId_participantType_idx" ON "ChatThreadParticipant"("threadId", "participantType");
CREATE INDEX "AgentMessage_threadId_idx" ON "AgentMessage"("threadId");
