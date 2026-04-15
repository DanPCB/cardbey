/*
  Warnings:

  - You are about to drop the `ContactIdentifier` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ContactMatch` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ContactSuggestion` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ContactSyncConsent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ContactSyncJob` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ContactSyncSource` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DomainVerifyAttempt` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `InviteEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Order` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OrderCancelRequest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OrderItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OrderStatusEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PublishEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PublishedSite` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserIdentifier` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "ContactIdentifier_sourceId_lastSeenAt_idx";

-- DropIndex
DROP INDEX "ContactIdentifier_kind_hash_idx";

-- DropIndex
DROP INDEX "ContactIdentifier_sourceId_kind_hash_hashVersion_key";

-- DropIndex
DROP INDEX "ContactMatch_sourceId_lastSeenAt_idx";

-- DropIndex
DROP INDEX "ContactMatch_matchedUserId_idx";

-- DropIndex
DROP INDEX "ContactMatch_sourceId_matchedUserId_key";

-- DropIndex
DROP INDEX "ContactSuggestion_expiresAt_idx";

-- DropIndex
DROP INDEX "ContactSuggestion_userId_createdAt_idx";

-- DropIndex
DROP INDEX "ContactSuggestion_userId_status_rankScore_idx";

-- DropIndex
DROP INDEX "ContactSyncConsent_userId_grantedAt_idx";

-- DropIndex
DROP INDEX "ContactSyncConsent_userId_status_idx";

-- DropIndex
DROP INDEX "ContactSyncJob_status_startedAt_idx";

-- DropIndex
DROP INDEX "ContactSyncJob_sourceId_startedAt_idx";

-- DropIndex
DROP INDEX "ContactSyncSource_status_lastSyncAt_idx";

-- DropIndex
DROP INDEX "ContactSyncSource_consentId_idx";

-- DropIndex
DROP INDEX "ContactSyncSource_userId_idx";

-- DropIndex
DROP INDEX "DomainVerifyAttempt_publishedSiteId_idx";

-- DropIndex
DROP INDEX "InviteEvent_targetKind_targetHash_idx";

-- DropIndex
DROP INDEX "InviteEvent_status_createdAt_idx";

-- DropIndex
DROP INDEX "InviteEvent_inviterUserId_createdAt_idx";

-- DropIndex
DROP INDEX "InviteEvent_inviteCode_key";

-- DropIndex
DROP INDEX "Order_orderNumber_key";

-- DropIndex
DROP INDEX "Order_createdAt_idx";

-- DropIndex
DROP INDEX "Order_status_idx";

-- DropIndex
DROP INDEX "Order_sellerStoreId_idx";

-- DropIndex
DROP INDEX "Order_sellerUserId_idx";

-- DropIndex
DROP INDEX "Order_buyerUserId_idx";

-- DropIndex
DROP INDEX "OrderCancelRequest_status_idx";

-- DropIndex
DROP INDEX "OrderCancelRequest_orderId_idx";

-- DropIndex
DROP INDEX "OrderCancelRequest_orderId_key";

-- DropIndex
DROP INDEX "OrderItem_orderId_idx";

-- DropIndex
DROP INDEX "OrderStatusEvent_createdAt_idx";

-- DropIndex
DROP INDEX "OrderStatusEvent_orderId_idx";

-- DropIndex
DROP INDEX "PublishEvent_publishedSiteId_idx";

-- DropIndex
DROP INDEX "PublishedSite_status_idx";

-- DropIndex
DROP INDEX "PublishedSite_customDomain_idx";

-- DropIndex
DROP INDEX "PublishedSite_slug_idx";

-- DropIndex
DROP INDEX "PublishedSite_draftStoreId_idx";

-- DropIndex
DROP INDEX "PublishedSite_storeId_idx";

-- DropIndex
DROP INDEX "PublishedSite_customDomain_key";

-- DropIndex
DROP INDEX "PublishedSite_slug_key";

-- DropIndex
DROP INDEX "UserIdentifier_verifiedAt_idx";

-- DropIndex
DROP INDEX "UserIdentifier_kind_hash_idx";

-- DropIndex
DROP INDEX "UserIdentifier_userId_idx";

-- DropIndex
DROP INDEX "UserIdentifier_kind_hash_hashVersion_key";

-- AlterTable
ALTER TABLE "Device" ADD COLUMN "lastPlaybackReportAt" DATETIME;
ALTER TABLE "Device" ADD COLUMN "playbackReportIsPlaying" BOOLEAN;
ALTER TABLE "Device" ADD COLUMN "playbackReportState" TEXT;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ContactIdentifier";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ContactMatch";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ContactSuggestion";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ContactSyncConsent";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ContactSyncJob";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ContactSyncSource";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "DomainVerifyAttempt";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "InviteEvent";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Order";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "OrderCancelRequest";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "OrderItem";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "OrderStatusEvent";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PublishEvent";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PublishedSite";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "UserIdentifier";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "PersonalMedia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonalMedia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MissionBlackboard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "agentId" TEXT,
    "correlationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MissionBlackboard_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "McpToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'MCP Token',
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Business" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "showOwnerProfile" BOOLEAN NOT NULL DEFAULT false,
    "translations" JSONB,
    "logo" TEXT,
    "region" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tradingHours" JSONB,
    "address" TEXT,
    "suburb" TEXT,
    "postcode" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "lat" REAL,
    "lng" REAL,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "tagline" TEXT,
    "heroText" TEXT,
    "heroImageUrl" TEXT,
    "avatarImageUrl" TEXT,
    "publishedAt" DATETIME,
    "stylePreferences" JSONB,
    "storefrontSettings" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Business_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Business" ("address", "avatarImageUrl", "country", "createdAt", "description", "heroImageUrl", "heroText", "id", "isActive", "lat", "lng", "logo", "name", "phone", "postcode", "primaryColor", "publishedAt", "region", "secondaryColor", "slug", "storefrontSettings", "stylePreferences", "suburb", "tagline", "tradingHours", "translations", "type", "updatedAt", "userId") SELECT "address", "avatarImageUrl", "country", "createdAt", "description", "heroImageUrl", "heroText", "id", "isActive", "lat", "lng", "logo", "name", "phone", "postcode", "primaryColor", "publishedAt", "region", "secondaryColor", "slug", "storefrontSettings", "stylePreferences", "suburb", "tagline", "tradingHours", "translations", "type", "updatedAt", "userId" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");
CREATE INDEX "Business_userId_idx" ON "Business"("userId");
CREATE INDEX "Business_slug_idx" ON "Business"("slug");
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT,
    "description" TEXT,
    "translations" JSONB,
    "price" REAL,
    "currency" TEXT DEFAULT 'AUD',
    "category" TEXT,
    "imageUrl" TEXT,
    "sku" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "images" JSONB,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "hasSam3Cutout" BOOLEAN NOT NULL DEFAULT false,
    "cutoutPath" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("businessId", "category", "createdAt", "currency", "cutoutPath", "deletedAt", "description", "hasSam3Cutout", "id", "imageUrl", "images", "isPublished", "likeCount", "name", "normalizedName", "price", "sku", "translations", "updatedAt", "viewCount") SELECT "businessId", "category", "createdAt", "currency", "cutoutPath", "deletedAt", "description", "hasSam3Cutout", "id", "imageUrl", "images", "isPublished", "likeCount", "name", "normalizedName", "price", "sku", "translations", "updatedAt", "viewCount" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE INDEX "Product_businessId_idx" ON "Product"("businessId");
CREATE INDEX "Product_businessId_isPublished_idx" ON "Product"("businessId", "isPublished");
CREATE INDEX "Product_category_idx" ON "Product"("category");
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");
CREATE INDEX "Product_hasSam3Cutout_idx" ON "Product"("hasSam3Cutout");
CREATE UNIQUE INDEX "Product_businessId_normalizedName_key" ON "Product"("businessId", "normalizedName");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "fullName" TEXT,
    "handle" TEXT,
    "avatarUrl" TEXT,
    "accountType" TEXT,
    "tagline" TEXT,
    "hasBusiness" BOOLEAN NOT NULL DEFAULT false,
    "onboarding" TEXT,
    "roles" TEXT NOT NULL DEFAULT '["viewer"]',
    "role" TEXT NOT NULL DEFAULT 'owner',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "verificationTokenRaw" TEXT,
    "verificationExpires" DATETIME,
    "resetToken" TEXT,
    "resetExpires" DATETIME,
    "aiCreditsBalance" INTEGER NOT NULL DEFAULT 0,
    "welcomeFullStoreRemaining" INTEGER NOT NULL DEFAULT 1,
    "aiCreditsUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "profilePhoto" TEXT,
    "bio" TEXT,
    "qrCodeUrl" TEXT,
    "personalPresenceStoreId" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "country" TEXT,
    "postcode" TEXT,
    CONSTRAINT "User_personalPresenceStoreId_fkey" FOREIGN KEY ("personalPresenceStoreId") REFERENCES "Business" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("accountType", "aiCreditsBalance", "aiCreditsUpdatedAt", "avatarUrl", "createdAt", "displayName", "email", "emailVerified", "fullName", "handle", "hasBusiness", "id", "onboarding", "passwordHash", "resetExpires", "resetToken", "role", "roles", "tagline", "updatedAt", "verificationExpires", "verificationToken", "verificationTokenRaw", "welcomeFullStoreRemaining") SELECT "accountType", "aiCreditsBalance", "aiCreditsUpdatedAt", "avatarUrl", "createdAt", "displayName", "email", "emailVerified", "fullName", "handle", "hasBusiness", "id", "onboarding", "passwordHash", "resetExpires", "resetToken", "role", "roles", "tagline", "updatedAt", "verificationExpires", "verificationToken", "verificationTokenRaw", "welcomeFullStoreRemaining" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");
CREATE UNIQUE INDEX "User_personalPresenceStoreId_key" ON "User"("personalPresenceStoreId");
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE INDEX "User_handle_idx" ON "User"("handle");
CREATE INDEX "User_verificationToken_idx" ON "User"("verificationToken");
CREATE INDEX "User_resetToken_idx" ON "User"("resetToken");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PersonalMedia_userId_idx" ON "PersonalMedia"("userId");

-- CreateIndex
CREATE INDEX "MissionBlackboard_missionId_seq_idx" ON "MissionBlackboard"("missionId", "seq");

-- CreateIndex
CREATE INDEX "MissionBlackboard_missionId_createdAt_idx" ON "MissionBlackboard"("missionId", "createdAt");

-- CreateIndex
CREATE INDEX "MissionBlackboard_correlationId_idx" ON "MissionBlackboard"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "MissionBlackboard_missionId_seq_key" ON "MissionBlackboard"("missionId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "McpToken_tokenHash_key" ON "McpToken"("tokenHash");

-- CreateIndex
CREATE INDEX "McpToken_userId_idx" ON "McpToken"("userId");

-- CreateIndex
CREATE INDEX "McpToken_storeId_idx" ON "McpToken"("storeId");

-- CreateIndex
CREATE INDEX "McpToken_tokenHash_idx" ON "McpToken"("tokenHash");
