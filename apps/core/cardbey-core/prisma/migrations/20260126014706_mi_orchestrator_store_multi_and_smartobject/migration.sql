/*
  Warnings:

  - You are about to drop the `QrLink` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `QrScanEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to alter the column `isActive` on the `Business` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - You are about to alter the column `stylePreferences` on the `Business` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `tradingHours` on the `Business` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `translations` on the `Business` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to drop the column `generationRunId` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `source` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `otpCode` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `otpExpires` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `plan` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "QrLink_promoId_idx";

-- DropIndex
DROP INDEX "QrLink_status_idx";

-- DropIndex
DROP INDEX "QrLink_tenantId_idx";

-- DropIndex
DROP INDEX "QrLink_storeId_targetType_idx";

-- DropIndex
DROP INDEX "QrLink_code_key";

-- DropIndex
DROP INDEX "QrScanEvent_targetType_createdAt_idx";

-- DropIndex
DROP INDEX "QrScanEvent_tenantId_createdAt_idx";

-- DropIndex
DROP INDEX "QrScanEvent_code_createdAt_idx";

-- DropIndex
DROP INDEX "QrScanEvent_storeId_createdAt_idx";

-- DropIndex
DROP INDEX "QrScanEvent_qrLinkId_createdAt_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "QrLink";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "QrScanEvent";
PRAGMA foreign_keys=on;

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
    "stylePreferences" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Business_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Business" ("address", "country", "createdAt", "description", "heroText", "id", "isActive", "lat", "lng", "logo", "name", "phone", "postcode", "primaryColor", "region", "secondaryColor", "slug", "stylePreferences", "suburb", "tagline", "tradingHours", "translations", "type", "updatedAt", "userId") SELECT "address", "country", "createdAt", "description", "heroText", "id", "isActive", "lat", "lng", "logo", "name", "phone", "postcode", "primaryColor", "region", "secondaryColor", "slug", "stylePreferences", "suburb", "tagline", "tradingHours", "translations", "type", "updatedAt", "userId" FROM "Business";
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
    "currency" TEXT DEFAULT 'USD',
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
    "verificationExpires" DATETIME,
    "resetToken" TEXT,
    "resetExpires" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("accountType", "avatarUrl", "createdAt", "displayName", "email", "emailVerified", "fullName", "handle", "hasBusiness", "id", "onboarding", "passwordHash", "resetExpires", "resetToken", "role", "roles", "tagline", "updatedAt", "verificationExpires", "verificationToken") SELECT "accountType", "avatarUrl", "createdAt", "displayName", "email", "emailVerified", "fullName", "handle", "hasBusiness", "id", "onboarding", "passwordHash", "resetExpires", "resetToken", "role", "roles", "tagline", "updatedAt", "verificationExpires", "verificationToken" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE INDEX "User_handle_idx" ON "User"("handle");
CREATE INDEX "User_verificationToken_idx" ON "User"("verificationToken");
CREATE INDEX "User_resetToken_idx" ON "User"("resetToken");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
