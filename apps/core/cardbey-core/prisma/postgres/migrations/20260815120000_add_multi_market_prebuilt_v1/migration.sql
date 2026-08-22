-- Additive multi-market + prebuilt store V1 tables (no destructive changes)

CREATE TABLE IF NOT EXISTS "multi_market_discovery_job" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "regionCode" TEXT,
    "territoryId" TEXT NOT NULL,
    "locality" TEXT,
    "categoryId" TEXT NOT NULL,
    "searchTermsJson" TEXT NOT NULL DEFAULT '[]',
    "language" TEXT NOT NULL DEFAULT 'en',
    "provider" TEXT NOT NULL DEFAULT 'auto',
    "providerCursor" TEXT,
    "campaignId" TEXT,
    "pilotId" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "slowMode" BOOLEAN NOT NULL DEFAULT false,
    "requestedLimit" INTEGER NOT NULL DEFAULT 20,
    "status" TEXT NOT NULL DEFAULT 'prepared',
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicatesSkipped" INTEGER NOT NULL DEFAULT 0,
    "failureClassesJson" TEXT NOT NULL DEFAULT '[]',
    "estimatedQueryCount" INTEGER NOT NULL DEFAULT 1,
    "queryAreaJson" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "multi_market_discovery_job_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "multi_market_discovery_job_countryCode_status_idx" ON "multi_market_discovery_job"("countryCode", "status");
CREATE INDEX IF NOT EXISTS "multi_market_discovery_job_batchId_idx" ON "multi_market_discovery_job"("batchId");
CREATE INDEX IF NOT EXISTS "multi_market_discovery_job_territoryId_categoryId_idx" ON "multi_market_discovery_job"("territoryId", "categoryId");

CREATE TABLE IF NOT EXISTS "public_business_card" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "seedId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_CREATED',
    "businessName" TEXT NOT NULL,
    "category" TEXT,
    "address" TEXT,
    "locality" TEXT,
    "countryCode" TEXT,
    "coordinatesJson" TEXT,
    "publicPhone" TEXT,
    "officialWebsite" TEXT,
    "socialLinksJson" TEXT,
    "openingHours" TEXT,
    "imageUrl" TEXT,
    "imageSource" TEXT,
    "disclosure" TEXT NOT NULL,
    "claimEligibilityJson" TEXT NOT NULL DEFAULT '{}',
    "publishedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "supersededStoreId" TEXT,
    "noindex" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "public_business_card_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "public_business_card_slug_key" ON "public_business_card"("slug");
CREATE INDEX IF NOT EXISTS "public_business_card_candidateId_idx" ON "public_business_card"("candidateId");
CREATE INDEX IF NOT EXISTS "public_business_card_status_idx" ON "public_business_card"("status");
CREATE INDEX IF NOT EXISTS "public_business_card_countryCode_idx" ON "public_business_card"("countryCode");

CREATE TABLE IF NOT EXISTS "prebuilt_store_draft" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "cardId" TEXT,
    "seedId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'GENERATING',
    "businessName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT,
    "address" TEXT,
    "locality" TEXT,
    "countryCode" TEXT,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "publicFeedExcluded" BOOLEAN NOT NULL DEFAULT true,
    "claimStartedAt" TIMESTAMP(3),
    "claimVerifiedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prebuilt_store_draft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "prebuilt_store_draft_candidateId_idx" ON "prebuilt_store_draft"("candidateId");
CREATE INDEX IF NOT EXISTS "prebuilt_store_draft_status_idx" ON "prebuilt_store_draft"("status");
CREATE INDEX IF NOT EXISTS "prebuilt_store_draft_slug_idx" ON "prebuilt_store_draft"("slug");

CREATE TABLE IF NOT EXISTS "prebuilt_offering_draft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priceText" TEXT,
    "evidenceClass" TEXT NOT NULL,
    "ownerAccepted" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "included" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prebuilt_offering_draft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "prebuilt_offering_draft_draftId_idx" ON "prebuilt_offering_draft"("draftId");

CREATE TABLE IF NOT EXISTS "prebuilt_asset_draft" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceUrlOrAssetId" TEXT,
    "custodyMode" TEXT,
    "retrievedAt" TIMESTAMP(3),
    "confidence" DOUBLE PRECISION,
    "ownerApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
    "attributionRequired" BOOLEAN NOT NULL DEFAULT false,
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prebuilt_asset_draft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "prebuilt_asset_draft_draftId_idx" ON "prebuilt_asset_draft"("draftId");

CREATE TABLE IF NOT EXISTS "prebuilt_field_evidence" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "evidenceClass" TEXT NOT NULL,
    "source" TEXT,
    "valueSummary" TEXT,
    "ownerAccepted" BOOLEAN,
    "blockedReason" TEXT,
    "conflictSummary" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prebuilt_field_evidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "prebuilt_field_evidence_draftId_fieldPath_idx" ON "prebuilt_field_evidence"("draftId", "fieldPath");

ALTER TABLE "prebuilt_offering_draft" ADD CONSTRAINT "prebuilt_offering_draft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "prebuilt_store_draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prebuilt_asset_draft" ADD CONSTRAINT "prebuilt_asset_draft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "prebuilt_store_draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prebuilt_field_evidence" ADD CONSTRAINT "prebuilt_field_evidence_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "prebuilt_store_draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
