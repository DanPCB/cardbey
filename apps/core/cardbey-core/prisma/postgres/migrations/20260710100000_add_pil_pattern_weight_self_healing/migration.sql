-- PIL learning Phase 3/4 — SelfHealingProposal + PatternWeight (missing on live Postgres)

CREATE TABLE IF NOT EXISTS "SelfHealingProposal" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "suggestedFix" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SelfHealingProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SelfHealingProposal_status_idx" ON "SelfHealingProposal"("status");
CREATE INDEX IF NOT EXISTS "SelfHealingProposal_type_idx" ON "SelfHealingProposal"("type");
CREATE INDEX IF NOT EXISTS "SelfHealingProposal_createdAt_idx" ON "SelfHealingProposal"("createdAt");

CREATE TABLE IF NOT EXISTS "PatternWeight" (
    "id" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "matchedSkill" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "adjustmentHistory" JSONB NOT NULL DEFAULT '[]',
    "lastAdjusted" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatternWeight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PatternWeight_patternId_key" ON "PatternWeight"("patternId");
CREATE INDEX IF NOT EXISTS "PatternWeight_intent_idx" ON "PatternWeight"("intent");
CREATE INDEX IF NOT EXISTS "PatternWeight_matchedSkill_idx" ON "PatternWeight"("matchedSkill");
