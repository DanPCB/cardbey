-- Cardbey Live Market Phase 1 foundation (additive).

CREATE TABLE IF NOT EXISTS "LiveMarketPilotEnrollment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'INVITED',
  "approvedHostUserIds" TEXT,
  "allowedSourceLanguages" TEXT,
  "allowedTargetLanguages" TEXT,
  "maxSessionDurationMinutes" INTEGER,
  "recordingAllowed" BOOLEAN NOT NULL DEFAULT 1,
  "automaticReplayPublication" BOOLEAN NOT NULL DEFAULT 1,
  "approvedAt" DATETIME,
  "approvedByActorId" TEXT,
  "pausedAt" DATETIME,
  "pausedByActorId" TEXT,
  "removedAt" DATETIME,
  "removedByActorId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "LiveMarketPilotEnrollment_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "LiveMarketPilotEnrollment_storeId_key"
  ON "LiveMarketPilotEnrollment"("storeId");
CREATE INDEX IF NOT EXISTS "LiveMarketPilotEnrollment_state_idx"
  ON "LiveMarketPilotEnrollment"("state");
CREATE INDEX IF NOT EXISTS "LiveMarketPilotEnrollment_storeId_state_idx"
  ON "LiveMarketPilotEnrollment"("storeId", "state");

CREATE TABLE IF NOT EXISTS "LiveMarketSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "hostUserId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "sourceLanguage" TEXT NOT NULL DEFAULT 'vi',
  "viewerLanguages" TEXT,
  "scheduledStartAt" DATETIME,
  "startedAt" DATETIME,
  "endedAt" DATETIME,
  "state" TEXT NOT NULL DEFAULT 'DRAFT',
  "recordingEnabled" BOOLEAN NOT NULL DEFAULT 1,
  "automaticReplayPublication" BOOLEAN NOT NULL DEFAULT 1,
  "providerExternalRef" TEXT,
  "endReasonCode" TEXT,
  "failureReasonCode" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "LiveMarketSession_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "LiveMarketSession_storeId_idx" ON "LiveMarketSession"("storeId");
CREATE INDEX IF NOT EXISTS "LiveMarketSession_storeId_state_idx" ON "LiveMarketSession"("storeId", "state");
CREATE INDEX IF NOT EXISTS "LiveMarketSession_hostUserId_idx" ON "LiveMarketSession"("hostUserId");
CREATE INDEX IF NOT EXISTS "LiveMarketSession_state_scheduledStartAt_idx"
  ON "LiveMarketSession"("state", "scheduledStartAt");
CREATE INDEX IF NOT EXISTS "LiveMarketSession_scheduledStartAt_idx"
  ON "LiveMarketSession"("scheduledStartAt");

CREATE TABLE IF NOT EXISTS "LiveMarketSessionSubject" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LiveMarketSessionSubject_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "LiveMarketSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "LiveMarketSessionSubject_sessionId_subjectType_subjectId_key"
  ON "LiveMarketSessionSubject"("sessionId", "subjectType", "subjectId");
CREATE INDEX IF NOT EXISTS "LiveMarketSessionSubject_sessionId_idx"
  ON "LiveMarketSessionSubject"("sessionId");
CREATE INDEX IF NOT EXISTS "LiveMarketSessionSubject_subjectId_idx"
  ON "LiveMarketSessionSubject"("subjectId");
