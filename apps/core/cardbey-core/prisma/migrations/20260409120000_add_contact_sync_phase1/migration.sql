-- Contact Sync Phase 1 MVP (privacy-first, additive)
-- Notes:
-- - Store only server-derived HMAC hashes (no raw identifiers).
-- - No coupling to AgentMessage / mission chat tables.

-- 1) Global verified identifiers for matching
CREATE TABLE IF NOT EXISTS "UserIdentifier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "hashVersion" TEXT NOT NULL DEFAULT 'v1',
    "source" TEXT NOT NULL DEFAULT 'email',
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserIdentifier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserIdentifier_kind_hash_hashVersion_key" ON "UserIdentifier"("kind", "hash", "hashVersion");
CREATE INDEX IF NOT EXISTS "UserIdentifier_userId_idx" ON "UserIdentifier"("userId");
CREATE INDEX IF NOT EXISTS "UserIdentifier_kind_hash_idx" ON "UserIdentifier"("kind", "hash");
CREATE INDEX IF NOT EXISTS "UserIdentifier_verifiedAt_idx" ON "UserIdentifier"("verifiedAt");

-- 2) Consent and sources
CREATE TABLE IF NOT EXISTS "ContactSyncConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'granted',
    "policyVersion" TEXT NOT NULL,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ContactSyncConsent_userId_status_idx" ON "ContactSyncConsent"("userId", "status");
CREATE INDEX IF NOT EXISTS "ContactSyncConsent_userId_grantedAt_idx" ON "ContactSyncConsent"("userId", "grantedAt");

CREATE TABLE IF NOT EXISTS "ContactSyncSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceFingerprint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastSyncAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContactSyncSource_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "ContactSyncConsent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ContactSyncSource_userId_idx" ON "ContactSyncSource"("userId");
CREATE INDEX IF NOT EXISTS "ContactSyncSource_consentId_idx" ON "ContactSyncSource"("consentId");
CREATE INDEX IF NOT EXISTS "ContactSyncSource_status_lastSyncAt_idx" ON "ContactSyncSource"("status", "lastSyncAt");

-- 3) Jobs
CREATE TABLE IF NOT EXISTS "ContactSyncJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'started',
    "counts" JSONB,
    "errorCode" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "ContactSyncJob_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ContactSyncSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ContactSyncJob_sourceId_startedAt_idx" ON "ContactSyncJob"("sourceId", "startedAt");
CREATE INDEX IF NOT EXISTS "ContactSyncJob_status_startedAt_idx" ON "ContactSyncJob"("status", "startedAt");

-- 4) Hashed identifiers (per source)
CREATE TABLE IF NOT EXISTS "ContactIdentifier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "hashVersion" TEXT NOT NULL DEFAULT 'v1',
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactIdentifier_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ContactSyncSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContactIdentifier_sourceId_kind_hash_hashVersion_key" ON "ContactIdentifier"("sourceId", "kind", "hash", "hashVersion");
CREATE INDEX IF NOT EXISTS "ContactIdentifier_kind_hash_idx" ON "ContactIdentifier"("kind", "hash");
CREATE INDEX IF NOT EXISTS "ContactIdentifier_sourceId_lastSeenAt_idx" ON "ContactIdentifier"("sourceId", "lastSeenAt");

-- 5) Matches
CREATE TABLE IF NOT EXISTS "ContactMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "matchedUserId" TEXT NOT NULL,
    "matchBasis" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactMatch_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ContactSyncSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContactMatch_sourceId_matchedUserId_key" ON "ContactMatch"("sourceId", "matchedUserId");
CREATE INDEX IF NOT EXISTS "ContactMatch_matchedUserId_idx" ON "ContactMatch"("matchedUserId");
CREATE INDEX IF NOT EXISTS "ContactMatch_sourceId_lastSeenAt_idx" ON "ContactMatch"("sourceId", "lastSeenAt");

-- 6) Suggestions (user-only UI layer)
CREATE TABLE IF NOT EXISTS "ContactSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "matchedUserId" TEXT,
    "rankScore" REAL NOT NULL DEFAULT 0,
    "reasonCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME
);

CREATE INDEX IF NOT EXISTS "ContactSuggestion_userId_status_rankScore_idx" ON "ContactSuggestion"("userId", "status", "rankScore");
CREATE INDEX IF NOT EXISTS "ContactSuggestion_userId_createdAt_idx" ON "ContactSuggestion"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ContactSuggestion_expiresAt_idx" ON "ContactSuggestion"("expiresAt");

-- 7) Invite events (manual invites in MVP)
CREATE TABLE IF NOT EXISTS "InviteEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inviterUserId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "targetKind" TEXT,
    "targetHash" TEXT,
    "hashVersion" TEXT,
    "acceptedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" DATETIME
);

CREATE UNIQUE INDEX IF NOT EXISTS "InviteEvent_inviteCode_key" ON "InviteEvent"("inviteCode");
CREATE INDEX IF NOT EXISTS "InviteEvent_inviterUserId_createdAt_idx" ON "InviteEvent"("inviterUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "InviteEvent_status_createdAt_idx" ON "InviteEvent"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "InviteEvent_targetKind_targetHash_idx" ON "InviteEvent"("targetKind", "targetHash");

