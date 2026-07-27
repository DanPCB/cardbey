-- PIL learning — skill dispatch telemetry (table was missing from migration chain).
CREATE TABLE IF NOT EXISTS "SkillDispatchLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "traceId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "query" TEXT NOT NULL DEFAULT '',
    "intent" TEXT NOT NULL,
    "matchedSkill" TEXT,
    "confidence" REAL NOT NULL,
    "executionPath" TEXT,
    "outcome" TEXT,
    "latencyMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "SkillDispatchLog_userId_createdAt_idx" ON "SkillDispatchLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "SkillDispatchLog_intent_confidence_idx" ON "SkillDispatchLog"("intent", "confidence");
CREATE INDEX IF NOT EXISTS "SkillDispatchLog_createdAt_idx" ON "SkillDispatchLog"("createdAt");
CREATE INDEX IF NOT EXISTS "SkillDispatchLog_traceId_idx" ON "SkillDispatchLog"("traceId");

CREATE TABLE IF NOT EXISTS "SkillDispatchFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dispatchLogId" TEXT NOT NULL,
    "userId" TEXT,
    "rating" INTEGER NOT NULL,
    "correctionText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkillDispatchFeedback_dispatchLogId_fkey" FOREIGN KEY ("dispatchLogId") REFERENCES "SkillDispatchLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SkillDispatchFeedback_dispatchLogId_idx" ON "SkillDispatchFeedback"("dispatchLogId");
CREATE INDEX IF NOT EXISTS "SkillDispatchFeedback_userId_idx" ON "SkillDispatchFeedback"("userId");
