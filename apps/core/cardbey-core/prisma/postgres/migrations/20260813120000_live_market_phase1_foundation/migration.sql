-- Cardbey Live Market Phase 1 foundation (additive).

CREATE TABLE IF NOT EXISTS "LiveMarketPilotEnrollment" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'INVITED',
  "approvedHostUserIds" JSONB,
  "allowedSourceLanguages" JSONB,
  "allowedTargetLanguages" JSONB,
  "maxSessionDurationMinutes" INTEGER,
  "recordingAllowed" BOOLEAN NOT NULL DEFAULT true,
  "automaticReplayPublication" BOOLEAN NOT NULL DEFAULT true,
  "approvedAt" TIMESTAMP(3),
  "approvedByActorId" TEXT,
  "pausedAt" TIMESTAMP(3),
  "pausedByActorId" TEXT,
  "removedAt" TIMESTAMP(3),
  "removedByActorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LiveMarketPilotEnrollment_pkey" PRIMARY KEY ("id"),
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
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "hostUserId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "sourceLanguage" TEXT NOT NULL DEFAULT 'vi',
  "viewerLanguages" JSONB,
  "scheduledStartAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "state" TEXT NOT NULL DEFAULT 'DRAFT',
  "recordingEnabled" BOOLEAN NOT NULL DEFAULT true,
  "automaticReplayPublication" BOOLEAN NOT NULL DEFAULT true,
  "providerExternalRef" TEXT,
  "endReasonCode" TEXT,
  "failureReasonCode" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LiveMarketSession_pkey" PRIMARY KEY ("id"),
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
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LiveMarketSessionSubject_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LiveMarketSessionSubject_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "LiveMarketSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "LiveMarketSessionSubject_sessionId_subjectType_subjectId_key"
  ON "LiveMarketSessionSubject"("sessionId", "subjectType", "subjectId");
CREATE INDEX IF NOT EXISTS "LiveMarketSessionSubject_sessionId_idx"
  ON "LiveMarketSessionSubject"("sessionId");
CREATE INDEX IF NOT EXISTS "LiveMarketSessionSubject_subjectId_idx"
  ON "LiveMarketSessionSubject"("subjectId");
