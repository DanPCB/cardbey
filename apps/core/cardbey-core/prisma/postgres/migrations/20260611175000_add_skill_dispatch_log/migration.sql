-- PIL learning — skill dispatch telemetry (table was missing from migration chain).
CREATE TABLE IF NOT EXISTS "SkillDispatchLog" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "query" TEXT NOT NULL DEFAULT '',
    "intent" TEXT NOT NULL,
    "matchedSkill" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "executionPath" TEXT,
    "outcome" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillDispatchLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SkillDispatchLog_userId_createdAt_idx" ON "SkillDispatchLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "SkillDispatchLog_intent_confidence_idx" ON "SkillDispatchLog"("intent", "confidence");
CREATE INDEX IF NOT EXISTS "SkillDispatchLog_createdAt_idx" ON "SkillDispatchLog"("createdAt");
CREATE INDEX IF NOT EXISTS "SkillDispatchLog_traceId_idx" ON "SkillDispatchLog"("traceId");

CREATE TABLE IF NOT EXISTS "SkillDispatchFeedback" (
    "id" TEXT NOT NULL,
    "dispatchLogId" TEXT NOT NULL,
    "userId" TEXT,
    "rating" INTEGER NOT NULL,
    "correctionText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillDispatchFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SkillDispatchFeedback_dispatchLogId_idx" ON "SkillDispatchFeedback"("dispatchLogId");
CREATE INDEX IF NOT EXISTS "SkillDispatchFeedback_userId_idx" ON "SkillDispatchFeedback"("userId");

ALTER TABLE "SkillDispatchFeedback" DROP CONSTRAINT IF EXISTS "SkillDispatchFeedback_dispatchLogId_fkey";
ALTER TABLE "SkillDispatchFeedback" ADD CONSTRAINT "SkillDispatchFeedback_dispatchLogId_fkey" FOREIGN KEY ("dispatchLogId") REFERENCES "SkillDispatchLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
