-- Universal Library Population Engine — Phase 2A foundation

CREATE TABLE "UniversalAsset" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "license" TEXT,
    "categories" JSONB,
    "tags" JSONB,
    "language" TEXT,
    "country" TEXT,
    "ownerId" TEXT,
    "creatorId" TEXT,
    "thumbnail" TEXT,
    "preview" TEXT,
    "metadata" JSONB,
    "rightsStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "hostingMode" TEXT NOT NULL DEFAULT 'REFERENCE',
    "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DISCOVERED',
    "duplicateOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UniversalAsset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UniversalAsset_duplicateOfId_fkey"
      FOREIGN KEY ("duplicateOfId") REFERENCES "UniversalAsset"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "UniversalAsset_status_idx" ON "UniversalAsset"("status");
CREATE INDEX "UniversalAsset_provider_idx" ON "UniversalAsset"("provider");
CREATE INDEX "UniversalAsset_type_idx" ON "UniversalAsset"("type");
CREATE INDEX "UniversalAsset_rightsStatus_idx" ON "UniversalAsset"("rightsStatus");

CREATE TABLE "UniversalAssetRelation" (
    "id" TEXT NOT NULL,
    "fromAssetId" TEXT NOT NULL,
    "toAssetId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "weight" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UniversalAssetRelation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UniversalAssetRelation_fromAssetId_fkey"
      FOREIGN KEY ("fromAssetId") REFERENCES "UniversalAsset"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UniversalAssetRelation_toAssetId_fkey"
      FOREIGN KEY ("toAssetId") REFERENCES "UniversalAsset"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UniversalAssetRelation_fromAssetId_toAssetId_relationType_key"
  ON "UniversalAssetRelation"("fromAssetId", "toAssetId", "relationType");
CREATE INDEX "UniversalAssetRelation_fromAssetId_idx" ON "UniversalAssetRelation"("fromAssetId");
CREATE INDEX "UniversalAssetRelation_toAssetId_idx" ON "UniversalAssetRelation"("toAssetId");

CREATE TABLE "ContentPopulationJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT,
    "status" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "payload" JSONB,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "ContentPopulationJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentPopulationJob_status_idx" ON "ContentPopulationJob"("status");
CREATE INDEX "ContentPopulationJob_kind_idx" ON "ContentPopulationJob"("kind");

CREATE TABLE "UniversalEntity" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UniversalEntity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UniversalEntity_kind_slug_key" ON "UniversalEntity"("kind", "slug");
CREATE INDEX "UniversalEntity_kind_idx" ON "UniversalEntity"("kind");

CREATE TABLE "UniversalEntityRelation" (
    "id" TEXT NOT NULL,
    "fromEntityId" TEXT NOT NULL,
    "toEntityId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "weight" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UniversalEntityRelation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UniversalEntityRelation_fromEntityId_fkey"
      FOREIGN KEY ("fromEntityId") REFERENCES "UniversalEntity"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UniversalEntityRelation_toEntityId_fkey"
      FOREIGN KEY ("toEntityId") REFERENCES "UniversalEntity"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UniversalEntityRelation_fromEntityId_toEntityId_relationType_key"
  ON "UniversalEntityRelation"("fromEntityId", "toEntityId", "relationType");

CREATE TABLE "MarketplacePurchase" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerUserId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "licenseCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketplacePurchase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketplacePurchase_buyerUserId_idx" ON "MarketplacePurchase"("buyerUserId");
CREATE INDEX "MarketplacePurchase_listingId_idx" ON "MarketplacePurchase"("listingId");

CREATE TABLE "UniversalDiscoveryScore" (
    "assetId" TEXT NOT NULL,
    "discoveryScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trendingScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "popularityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "signals" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UniversalDiscoveryScore_pkey" PRIMARY KEY ("assetId"),
    CONSTRAINT "UniversalDiscoveryScore_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "UniversalAsset"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);
