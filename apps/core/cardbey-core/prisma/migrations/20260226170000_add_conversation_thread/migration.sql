-- ConversationThread: tenant-scoped thread with missionId and status
CREATE TABLE "ConversationThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "title" TEXT,
    "missionId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConversationThread_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ThreadParticipant: unique (threadId, participantType, participantId)
CREATE TABLE "ThreadParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "participantType" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ThreadParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ConversationThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ConversationThread_tenantId_createdAt_idx" ON "ConversationThread"("tenantId", "createdAt");
CREATE INDEX "ConversationThread_missionId_idx" ON "ConversationThread"("missionId");
CREATE INDEX "ConversationThread_createdByUserId_idx" ON "ConversationThread"("createdByUserId");
CREATE UNIQUE INDEX "ThreadParticipant_threadId_participantType_participantId_key" ON "ThreadParticipant"("threadId", "participantType", "participantId");
CREATE INDEX "ThreadParticipant_threadId_idx" ON "ThreadParticipant"("threadId");
CREATE INDEX "ThreadParticipant_threadId_participantType_idx" ON "ThreadParticipant"("threadId", "participantType");
