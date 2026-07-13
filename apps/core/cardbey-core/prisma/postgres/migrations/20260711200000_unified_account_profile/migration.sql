-- Unified AccountProfile + UserAccountEvent

CREATE TABLE "AccountProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "primaryCapability" TEXT,
    "accountStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "creatorPublishingRestricted" BOOLEAN NOT NULL DEFAULT false,
    "businessManagementRestricted" BOOLEAN NOT NULL DEFAULT false,
    "internalNotes" JSONB,
    "languages" JSONB,
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountProfile_userId_key" ON "AccountProfile"("userId");
CREATE INDEX "AccountProfile_accountStatus_idx" ON "AccountProfile"("accountStatus");

ALTER TABLE "AccountProfile" ADD CONSTRAINT "AccountProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserAccountEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "reasonCode" TEXT,
    "publicReason" TEXT,
    "internalNote" TEXT,
    "previousStateJson" JSONB,
    "nextStateJson" JSONB,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAccountEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserAccountEvent_userId_idx" ON "UserAccountEvent"("userId");
CREATE INDEX "UserAccountEvent_eventType_idx" ON "UserAccountEvent"("eventType");
CREATE INDEX "UserAccountEvent_createdAt_idx" ON "UserAccountEvent"("createdAt");

ALTER TABLE "UserAccountEvent" ADD CONSTRAINT "UserAccountEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
