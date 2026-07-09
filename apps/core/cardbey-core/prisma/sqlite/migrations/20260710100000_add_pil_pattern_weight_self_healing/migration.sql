-- PIL learning Phase 3/4 — SelfHealingProposal + PatternWeight

CREATE TABLE IF NOT EXISTS "SelfHealingProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "suggestedFix" TEXT NOT NULL,
    "metadata" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "requiresConfirmation" INTEGER NOT NULL DEFAULT 1,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS "SelfHealingProposal_status_idx" ON "SelfHealingProposal"("status");
CREATE INDEX IF NOT EXISTS "SelfHealingProposal_type_idx" ON "SelfHealingProposal"("type");
CREATE INDEX IF NOT EXISTS "SelfHealingProposal_createdAt_idx" ON "SelfHealingProposal"("createdAt");

CREATE TABLE IF NOT EXISTS "PatternWeight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patternId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "matchedSkill" TEXT NOT NULL,
    "weight" REAL NOT NULL DEFAULT 1.0,
    "adjustmentHistory" TEXT NOT NULL DEFAULT '[]',
    "lastAdjusted" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "PatternWeight_patternId_key" ON "PatternWeight"("patternId");
CREATE INDEX IF NOT EXISTS "PatternWeight_intent_idx" ON "PatternWeight"("intent");
CREATE INDEX IF NOT EXISTS "PatternWeight_matchedSkill_idx" ON "PatternWeight"("matchedSkill");
