-- Add spec indexes: (tenantId, updatedAt) for thread list ordering; (threadId, createdAt) for participants
CREATE INDEX "ConversationThread_tenantId_updatedAt_idx" ON "ConversationThread"("tenantId", "updatedAt");
CREATE INDEX "ThreadParticipant_threadId_createdAt_idx" ON "ThreadParticipant"("threadId", "createdAt");
