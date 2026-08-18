-- Global Live × Cnet commercial contract (additive; flag-gated at runtime)
CREATE TABLE "GlobalLiveCnetCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicRef" TEXT NOT NULL,
    "liveSessionPublicRef" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeSlug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "creativeVersion" INTEGER NOT NULL DEFAULT 1,
    "validFrom" DATETIME,
    "validUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GlobalLiveCnetCampaign_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveMarketSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GlobalLiveCnetCampaign_publicRef_key" ON "GlobalLiveCnetCampaign"("publicRef");
CREATE UNIQUE INDEX "GlobalLiveCnetCampaign_liveSessionId_key" ON "GlobalLiveCnetCampaign"("liveSessionId");
CREATE INDEX "GlobalLiveCnetCampaign_storeId_status_idx" ON "GlobalLiveCnetCampaign"("storeId", "status");

CREATE TABLE "GlobalLiveCnetPlacement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicRef" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "devicePublicCode" TEXT NOT NULL,
    "locationLabel" TEXT,
    "attributionToken" TEXT NOT NULL,
    "validFrom" DATETIME,
    "validUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GlobalLiveCnetPlacement_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "GlobalLiveCnetCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GlobalLiveCnetPlacement_publicRef_key" ON "GlobalLiveCnetPlacement"("publicRef");
CREATE UNIQUE INDEX "GlobalLiveCnetPlacement_attributionToken_key" ON "GlobalLiveCnetPlacement"("attributionToken");
CREATE UNIQUE INDEX "GlobalLiveCnetPlacement_campaignId_deviceId_key" ON "GlobalLiveCnetPlacement"("campaignId", "deviceId");
CREATE INDEX "GlobalLiveCnetPlacement_deviceId_idx" ON "GlobalLiveCnetPlacement"("deviceId");
CREATE INDEX "GlobalLiveCnetPlacement_devicePublicCode_idx" ON "GlobalLiveCnetPlacement"("devicePublicCode");

CREATE TABLE "GlobalLiveCnetEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "placementId" TEXT,
    "campaignPublicRef" TEXT NOT NULL,
    "liveSessionPublicRef" TEXT NOT NULL,
    "storePublicRef" TEXT NOT NULL,
    "devicePublicCode" TEXT,
    "placementPublicCode" TEXT,
    "attributionToken" TEXT,
    "creativeVersion" INTEGER NOT NULL DEFAULT 1,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GlobalLiveCnetEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "GlobalLiveCnetCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GlobalLiveCnetEvent_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "GlobalLiveCnetPlacement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GlobalLiveCnetEvent_dedupeKey_key" ON "GlobalLiveCnetEvent"("dedupeKey");
CREATE INDEX "GlobalLiveCnetEvent_campaignId_eventType_createdAt_idx" ON "GlobalLiveCnetEvent"("campaignId", "eventType", "createdAt");
CREATE INDEX "GlobalLiveCnetEvent_eventType_createdAt_idx" ON "GlobalLiveCnetEvent"("eventType", "createdAt");
