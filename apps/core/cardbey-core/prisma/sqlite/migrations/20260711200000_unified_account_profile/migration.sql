-- Unified AccountProfile + UserAccountEvent

CREATE TABLE "AccountProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "capabilities" TEXT NOT NULL DEFAULT '[]',
    "primaryCapability" TEXT,
    "accountStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "creatorPublishingRestricted" BOOLEAN NOT NULL DEFAULT false,
    "businessManagementRestricted" BOOLEAN NOT NULL DEFAULT false,
    "internalNotes" TEXT,
    "languages" TEXT,
    "lastActiveAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AccountProfile_userId_key" ON "AccountProfile"("userId");
CREATE INDEX "AccountProfile_accountStatus_idx" ON "AccountProfile"("accountStatus");

CREATE TABLE "UserAccountEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "reasonCode" TEXT,
    "publicReason" TEXT,
    "internalNote" TEXT,
    "previousStateJson" TEXT,
    "nextStateJson" TEXT,
    "requestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAccountEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "UserAccountEvent_userId_idx" ON "UserAccountEvent"("userId");
CREATE INDEX "UserAccountEvent_eventType_idx" ON "UserAccountEvent"("eventType");
CREATE INDEX "UserAccountEvent_createdAt_idx" ON "UserAccountEvent"("createdAt");
