-- Canonical store engagement: StoreActivityEvent + derived StoreEngagementSnapshot.

CREATE TABLE IF NOT EXISTS "StoreActivityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "sessionId" TEXT,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreActivityEvent_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Business" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "StoreActivityEvent_storeId_idx" ON "StoreActivityEvent"("storeId");
CREATE INDEX IF NOT EXISTS "StoreActivityEvent_storeId_eventType_idx" ON "StoreActivityEvent"("storeId", "eventType");
CREATE INDEX IF NOT EXISTS "StoreActivityEvent_storeId_createdAt_idx" ON "StoreActivityEvent"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "StoreActivityEvent_eventType_createdAt_idx" ON "StoreActivityEvent"("eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "StoreActivityEvent_storeId_sessionId_eventType_createdAt_idx"
  ON "StoreActivityEvent"("storeId", "sessionId", "eventType", "createdAt");

CREATE TABLE IF NOT EXISTS "StoreEngagementSnapshot" (
    "storeId" TEXT NOT NULL PRIMARY KEY,
    "followersCount" INTEGER NOT NULL DEFAULT 0,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "savesCount" INTEGER NOT NULL DEFAULT 0,
    "sharesCount" INTEGER NOT NULL DEFAULT 0,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "views24h" INTEGER NOT NULL DEFAULT 0,
    "views7d" INTEGER NOT NULL DEFAULT 0,
    "qrScansCount" INTEGER NOT NULL DEFAULT 0,
    "orderClicksCount" INTEGER NOT NULL DEFAULT 0,
    "callClicksCount" INTEGER NOT NULL DEFAULT 0,
    "offerClaimsCount" INTEGER NOT NULL DEFAULT 0,
    "engagementScore" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoreEngagementSnapshot_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Business" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "StoreFollow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreFollow_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Business" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoreFollow_storeId_actorKey_key" ON "StoreFollow"("storeId", "actorKey");
CREATE INDEX IF NOT EXISTS "StoreFollow_storeId_idx" ON "StoreFollow"("storeId");
CREATE INDEX IF NOT EXISTS "StoreFollow_userId_idx" ON "StoreFollow"("userId");

CREATE TABLE IF NOT EXISTS "StoreReaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "userId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoreReaction_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Business" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoreReaction_storeId_actorKey_key" ON "StoreReaction"("storeId", "actorKey");
CREATE INDEX IF NOT EXISTS "StoreReaction_storeId_idx" ON "StoreReaction"("storeId");

CREATE TABLE IF NOT EXISTS "StoreSave" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreSave_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Business" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoreSave_storeId_actorKey_key" ON "StoreSave"("storeId", "actorKey");
CREATE INDEX IF NOT EXISTS "StoreSave_storeId_idx" ON "StoreSave"("storeId");

CREATE TABLE IF NOT EXISTS "StoreShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "userId" TEXT,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreShare_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Business" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "StoreShare_storeId_idx" ON "StoreShare"("storeId");
CREATE INDEX IF NOT EXISTS "StoreShare_storeId_createdAt_idx" ON "StoreShare"("storeId", "createdAt");

CREATE TABLE IF NOT EXISTS "OfferClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfferClaim_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Business" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "OfferClaim_storeId_idx" ON "OfferClaim"("storeId");
CREATE INDEX IF NOT EXISTS "OfferClaim_offerId_idx" ON "OfferClaim"("offerId");
CREATE INDEX IF NOT EXISTS "OfferClaim_storeId_offerId_idx" ON "OfferClaim"("storeId", "offerId");
