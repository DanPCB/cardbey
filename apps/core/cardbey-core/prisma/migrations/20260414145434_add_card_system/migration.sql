-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "businessId" TEXT,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "designJson" JSONB,
    "renderedUrl" TEXT,
    "printUrl" TEXT,
    "qrCodeUrl" TEXT,
    "liveUrl" TEXT,
    "sizeW" REAL,
    "sizeH" REAL,
    "sizeUnit" TEXT,
    "sizeDpi" INTEGER,
    "agentPersonality" TEXT,
    "knowledgeBase" JSONB,
    "capabilities" TEXT NOT NULL DEFAULT '[]',
    "autoApprove" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Card_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Card_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CardVisitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "name" TEXT,
    "platformVisitorId" TEXT,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL,
    CONSTRAINT "CardVisitor_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CardConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "messages" JSONB NOT NULL DEFAULT [],
    "outcome" TEXT,
    "intent" TEXT,
    "sentiment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CardConversation_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardConversation_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "CardVisitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CardLoyaltyStamp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "stampedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" DATETIME,
    CONSTRAINT "CardLoyaltyStamp_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardLoyaltyStamp_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "CardVisitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CardPromoRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "redeemedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discountApplied" TEXT,
    CONSTRAINT "CardPromoRedemption_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardPromoRedemption_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "CardVisitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CardEventRsvp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rsvpAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardEventRsvp_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardEventRsvp_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "CardVisitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Card_userId_createdAt_idx" ON "Card"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Card_businessId_createdAt_idx" ON "Card"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "Card_type_status_idx" ON "Card"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CardVisitor_sessionToken_key" ON "CardVisitor"("sessionToken");

-- CreateIndex
CREATE INDEX "CardVisitor_cardId_lastSeenAt_idx" ON "CardVisitor"("cardId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "CardVisitor_platformVisitorId_idx" ON "CardVisitor"("platformVisitorId");

-- CreateIndex
CREATE INDEX "CardConversation_cardId_updatedAt_idx" ON "CardConversation"("cardId", "updatedAt");

-- CreateIndex
CREATE INDEX "CardConversation_visitorId_updatedAt_idx" ON "CardConversation"("visitorId", "updatedAt");

-- CreateIndex
CREATE INDEX "CardConversation_channel_createdAt_idx" ON "CardConversation"("channel", "createdAt");

-- CreateIndex
CREATE INDEX "CardLoyaltyStamp_cardId_stampedAt_idx" ON "CardLoyaltyStamp"("cardId", "stampedAt");

-- CreateIndex
CREATE INDEX "CardLoyaltyStamp_visitorId_stampedAt_idx" ON "CardLoyaltyStamp"("visitorId", "stampedAt");

-- CreateIndex
CREATE INDEX "CardPromoRedemption_cardId_redeemedAt_idx" ON "CardPromoRedemption"("cardId", "redeemedAt");

-- CreateIndex
CREATE INDEX "CardPromoRedemption_visitorId_redeemedAt_idx" ON "CardPromoRedemption"("visitorId", "redeemedAt");

-- CreateIndex
CREATE INDEX "CardEventRsvp_cardId_rsvpAt_idx" ON "CardEventRsvp"("cardId", "rsvpAt");

-- CreateIndex
CREATE INDEX "CardEventRsvp_visitorId_rsvpAt_idx" ON "CardEventRsvp"("visitorId", "rsvpAt");
