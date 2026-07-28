-- CreateTable
CREATE TABLE IF NOT EXISTS "PerformerAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "step" TEXT NOT NULL,
    "imageHash" TEXT NOT NULL,
    "understandingId" TEXT,
    "source" TEXT,
    "confidence" REAL,
    "fields" TEXT,
    "validationResult" TEXT,
    "userAction" TEXT,
    "userEdits" TEXT,
    "error" TEXT,
    "metadata" TEXT,
    "environment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "PerformerAuditLog_imageHash_idx" ON "PerformerAuditLog"("imageHash");
CREATE INDEX IF NOT EXISTS "PerformerAuditLog_createdAt_idx" ON "PerformerAuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "PerformerAuditLog_sessionId_idx" ON "PerformerAuditLog"("sessionId");
CREATE INDEX IF NOT EXISTS "PerformerAuditLog_step_source_idx" ON "PerformerAuditLog"("step", "source");
CREATE INDEX IF NOT EXISTS "PerformerAuditLog_confidence_idx" ON "PerformerAuditLog"("confidence");
CREATE INDEX IF NOT EXISTS "PerformerAuditLog_userId_createdAt_idx" ON "PerformerAuditLog"("userId", "createdAt");
