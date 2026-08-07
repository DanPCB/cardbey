-- Creator Marketplace Phase 1C
CREATE TABLE "MarketplaceSellerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'AUD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "applicationVersion" TEXT NOT NULL DEFAULT '1',
    "termsAcceptedAt" DATETIME,
    "rightsPolicyAcceptedAt" DATETIME,
    "applicationBio" TEXT,
    "applicationMotivation" TEXT,
    "applicationPortfolioUrl" TEXT,
    "applicationLanguages" JSON,
    "applicationNotes" TEXT,
    "reviewReason" TEXT,
    "restrictionReason" TEXT,
    "adminNotes" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" DATETIME,
    "approvedAt" DATETIME,
    "restrictedAt" DATETIME,
    "suspendedAt" DATETIME,
    "restoredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MarketplaceSellerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MarketplaceSellerProfile_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MarketplaceSellerStatusEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "reason" TEXT,
    "metadataJson" JSON,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketplaceSellerStatusEvent_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "MarketplaceSellerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "sourceContentId" TEXT NOT NULL,
    "sourceContentType" TEXT NOT NULL,
    "activeSourceKey" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT,
    "thumbnailUrl" TEXT,
    "accessType" TEXT NOT NULL DEFAULT 'FREE',
    "priceAmount" INTEGER NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'AUD',
    "licenceCode" TEXT NOT NULL,
    "licenceVersion" TEXT,
    "customLicenceText" TEXT,
    "ownershipType" TEXT NOT NULL,
    "sellerNotes" TEXT,
    "adminFeedbackJson" JSON,
    "reviewReason" TEXT,
    "listingStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "availabilityStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "restorableStatus" TEXT,
    "submittedAt" DATETIME,
    "approvedAt" DATETIME,
    "approvedByUserId" TEXT,
    "publishedAt" DATETIME,
    "publishedByUserId" TEXT,
    "unpublishedAt" DATETIME,
    "suspendedAt" DATETIME,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MarketplaceListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "MarketplaceSellerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MarketplaceListing_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MarketplaceListing_sourceContentId_fkey" FOREIGN KEY ("sourceContentId") REFERENCES "CreatorContent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MarketplaceOwnershipDeclaration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "ownershipType" TEXT NOT NULL,
    "rightsConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "commercialRightsConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "creatorAuthoredWork" BOOLEAN NOT NULL DEFAULT false,
    "declarationText" TEXT,
    "evidenceJson" JSON,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MarketplaceOwnershipDeclaration_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MarketplaceAssetProvenance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "sourceUrl" TEXT,
    "derivativeDisclosure" TEXT,
    "evidenceJson" JSON,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MarketplaceAssetProvenance_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MarketplaceListingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "reason" TEXT,
    "metadataJson" JSON,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketplaceListingEvent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MarketplaceSellerProfile_userId_key" ON "MarketplaceSellerProfile"("userId");
CREATE UNIQUE INDEX "MarketplaceSellerProfile_creatorId_key" ON "MarketplaceSellerProfile"("creatorId");
CREATE INDEX "MarketplaceSellerProfile_status_idx" ON "MarketplaceSellerProfile"("status");
CREATE INDEX "MarketplaceSellerProfile_createdAt_idx" ON "MarketplaceSellerProfile"("createdAt");
CREATE INDEX "MarketplaceSellerProfile_reviewedAt_idx" ON "MarketplaceSellerProfile"("reviewedAt");

CREATE INDEX "MarketplaceSellerStatusEvent_sellerId_idx" ON "MarketplaceSellerStatusEvent"("sellerId");
CREATE INDEX "MarketplaceSellerStatusEvent_newStatus_idx" ON "MarketplaceSellerStatusEvent"("newStatus");
CREATE INDEX "MarketplaceSellerStatusEvent_createdAt_idx" ON "MarketplaceSellerStatusEvent"("createdAt");

CREATE UNIQUE INDEX "MarketplaceListing_activeSourceKey_key" ON "MarketplaceListing"("activeSourceKey");
CREATE INDEX "MarketplaceListing_sellerId_idx" ON "MarketplaceListing"("sellerId");
CREATE INDEX "MarketplaceListing_creatorId_idx" ON "MarketplaceListing"("creatorId");
CREATE INDEX "MarketplaceListing_sourceContentId_idx" ON "MarketplaceListing"("sourceContentId");
CREATE INDEX "MarketplaceListing_listingStatus_idx" ON "MarketplaceListing"("listingStatus");
CREATE INDEX "MarketplaceListing_availabilityStatus_idx" ON "MarketplaceListing"("availabilityStatus");
CREATE INDEX "MarketplaceListing_publishedAt_idx" ON "MarketplaceListing"("publishedAt");

CREATE UNIQUE INDEX "MarketplaceOwnershipDeclaration_listingId_key" ON "MarketplaceOwnershipDeclaration"("listingId");
CREATE INDEX "MarketplaceOwnershipDeclaration_ownershipType_idx" ON "MarketplaceOwnershipDeclaration"("ownershipType");

CREATE UNIQUE INDEX "MarketplaceAssetProvenance_listingId_key" ON "MarketplaceAssetProvenance"("listingId");
CREATE INDEX "MarketplaceAssetProvenance_sourceKind_idx" ON "MarketplaceAssetProvenance"("sourceKind");

CREATE INDEX "MarketplaceListingEvent_listingId_idx" ON "MarketplaceListingEvent"("listingId");
CREATE INDEX "MarketplaceListingEvent_eventType_idx" ON "MarketplaceListingEvent"("eventType");
CREATE INDEX "MarketplaceListingEvent_createdAt_idx" ON "MarketplaceListingEvent"("createdAt");
