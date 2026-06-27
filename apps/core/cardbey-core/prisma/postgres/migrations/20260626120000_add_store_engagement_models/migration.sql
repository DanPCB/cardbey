-- Canonical store engagement: StoreActivityEvent + derived StoreEngagementSnapshot.

CREATE TABLE "StoreActivityEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "sessionId" TEXT,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreActivityEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoreActivityEvent_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "StoreActivityEvent_storeId_idx" ON "StoreActivityEvent"("storeId");
CREATE INDEX "StoreActivityEvent_storeId_eventType_idx" ON "StoreActivityEvent"("storeId", "eventType");
CREATE INDEX "StoreActivityEvent_storeId_createdAt_idx" ON "StoreActivityEvent"("storeId", "createdAt");
CREATE INDEX "StoreActivityEvent_eventType_createdAt_idx" ON "StoreActivityEvent"("eventType", "createdAt");
CREATE INDEX "StoreActivityEvent_storeId_sessionId_eventType_createdAt_idx"
  ON "StoreActivityEvent"("storeId", "sessionId", "eventType", "createdAt");

CREATE TABLE "StoreEngagementSnapshot" (
    "storeId" TEXT NOT NULL,
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
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreEngagementSnapshot_pkey" PRIMARY KEY ("storeId"),
    CONSTRAINT "StoreEngagementSnapshot_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "StoreFollow" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreFollow_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoreFollow_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StoreFollow_storeId_actorKey_key" ON "StoreFollow"("storeId", "actorKey");
CREATE INDEX "StoreFollow_storeId_idx" ON "StoreFollow"("storeId");
CREATE INDEX "StoreFollow_userId_idx" ON "StoreFollow"("userId");

CREATE TABLE "StoreReaction" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "userId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreReaction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoreReaction_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StoreReaction_storeId_actorKey_key" ON "StoreReaction"("storeId", "actorKey");
CREATE INDEX "StoreReaction_storeId_idx" ON "StoreReaction"("storeId");

CREATE TABLE "StoreSave" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreSave_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoreSave_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StoreSave_storeId_actorKey_key" ON "StoreSave"("storeId", "actorKey");
CREATE INDEX "StoreSave_storeId_idx" ON "StoreSave"("storeId");

CREATE TABLE "StoreShare" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "userId" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreShare_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoreShare_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "StoreShare_storeId_idx" ON "StoreShare"("storeId");
CREATE INDEX "StoreShare_storeId_createdAt_idx" ON "StoreShare"("storeId", "createdAt");

CREATE TABLE "OfferClaim" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfferClaim_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OfferClaim_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "OfferClaim_storeId_idx" ON "OfferClaim"("storeId");
CREATE INDEX "OfferClaim_offerId_idx" ON "OfferClaim"("offerId");
CREATE INDEX "OfferClaim_storeId_offerId_idx" ON "OfferClaim"("storeId", "offerId");
