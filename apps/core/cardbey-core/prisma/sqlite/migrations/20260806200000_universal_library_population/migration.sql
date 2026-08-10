-- Universal Library Population Engine — Phase 2A foundation

CREATE TABLE IF NOT EXISTS "UniversalAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "license" TEXT,
    "categories" TEXT,
    "tags" TEXT,
    "language" TEXT,
    "country" TEXT,
    "ownerId" TEXT,
    "creatorId" TEXT,
    "thumbnail" TEXT,
    "preview" TEXT,
    "metadata" TEXT,
    "rightsStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "hostingMode" TEXT NOT NULL DEFAULT 'REFERENCE',
    "qualityScore" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DISCOVERED',
    "duplicateOfId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UniversalAsset_duplicateOfId_fkey"
      FOREIGN KEY ("duplicateOfId") REFERENCES "UniversalAsset" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "UniversalAsset_status_idx" ON "UniversalAsset"("status");
CREATE INDEX IF NOT EXISTS "UniversalAsset_provider_idx" ON "UniversalAsset"("provider");
CREATE INDEX IF NOT EXISTS "UniversalAsset_type_idx" ON "UniversalAsset"("type");
CREATE INDEX IF NOT EXISTS "UniversalAsset_rightsStatus_idx" ON "UniversalAsset"("rightsStatus");

CREATE TABLE IF NOT EXISTS "UniversalAssetRelation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromAssetId" TEXT NOT NULL,
    "toAssetId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "weight" REAL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UniversalAssetRelation_fromAssetId_fkey"
      FOREIGN KEY ("fromAssetId") REFERENCES "UniversalAsset" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UniversalAssetRelation_toAssetId_fkey"
      FOREIGN KEY ("toAssetId") REFERENCES "UniversalAsset" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UniversalAssetRelation_fromAssetId_toAssetId_relationType_key"
  ON "UniversalAssetRelation"("fromAssetId", "toAssetId", "relationType");
CREATE INDEX IF NOT EXISTS "UniversalAssetRelation_fromAssetId_idx" ON "UniversalAssetRelation"("fromAssetId");
CREATE INDEX IF NOT EXISTS "UniversalAssetRelation_toAssetId_idx" ON "UniversalAssetRelation"("toAssetId");

CREATE TABLE IF NOT EXISTS "ContentPopulationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "provider" TEXT,
    "status" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "payload" TEXT,
    "result" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME
);

CREATE INDEX IF NOT EXISTS "ContentPopulationJob_status_idx" ON "ContentPopulationJob"("status");
CREATE INDEX IF NOT EXISTS "ContentPopulationJob_kind_idx" ON "ContentPopulationJob"("kind");

CREATE TABLE IF NOT EXISTS "UniversalEntity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "UniversalEntity_kind_slug_key" ON "UniversalEntity"("kind", "slug");
CREATE INDEX IF NOT EXISTS "UniversalEntity_kind_idx" ON "UniversalEntity"("kind");

CREATE TABLE IF NOT EXISTS "UniversalEntityRelation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromEntityId" TEXT NOT NULL,
    "toEntityId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "weight" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UniversalEntityRelation_fromEntityId_fkey"
      FOREIGN KEY ("fromEntityId") REFERENCES "UniversalEntity" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UniversalEntityRelation_toEntityId_fkey"
      FOREIGN KEY ("toEntityId") REFERENCES "UniversalEntity" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UniversalEntityRelation_fromEntityId_toEntityId_relationType_key"
  ON "UniversalEntityRelation"("fromEntityId", "toEntityId", "relationType");

CREATE TABLE IF NOT EXISTS "MarketplacePurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "buyerUserId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "licenseCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "MarketplacePurchase_buyerUserId_idx" ON "MarketplacePurchase"("buyerUserId");
CREATE INDEX IF NOT EXISTS "MarketplacePurchase_listingId_idx" ON "MarketplacePurchase"("listingId");

CREATE TABLE IF NOT EXISTS "UniversalDiscoveryScore" (
    "assetId" TEXT NOT NULL PRIMARY KEY,
    "discoveryScore" REAL NOT NULL DEFAULT 0,
    "trendingScore" REAL NOT NULL DEFAULT 0,
    "qualityScore" REAL NOT NULL DEFAULT 0,
    "trustScore" REAL NOT NULL DEFAULT 0,
    "popularityScore" REAL NOT NULL DEFAULT 0,
    "signals" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UniversalDiscoveryScore_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "UniversalAsset" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);
