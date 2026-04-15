/*
  Warnings:

  - You are about to alter the column `translations` on the `Business` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `aiContext` on the `CreativeTemplate` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `fields` on the `CreativeTemplate` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `translations` on the `Playlist` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `translations` on the `Product` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `translations` on the `SignageAsset` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.

*/
-- CreateTable
CREATE TABLE "GreetingCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "title" TEXT,
    "message" TEXT,
    "coverImageUrl" TEXT,
    "mediaUrl" TEXT,
    "payloadJson" JSONB,
    "shareSlug" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GreetingCard_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Business_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Business" ("address", "country", "createdAt", "description", "id", "isActive", "lat", "lng", "logo", "name", "phone", "postcode", "region", "slug", "suburb", "tradingHours", "translations", "type", "updatedAt", "userId") SELECT "address", "country", "createdAt", "description", "id", "isActive", "lat", "lng", "logo", "name", "phone", "postcode", "region", "slug", "suburb", "tradingHours", "translations", "type", "updatedAt", "userId" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
CREATE UNIQUE INDEX "Business_userId_key" ON "Business"("userId");
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");
CREATE INDEX "Business_slug_idx" ON "Business"("slug");
CREATE TABLE "new_CreativeTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "storeId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "baseContentId" TEXT,
    "channels" TEXT NOT NULL DEFAULT '[]',
    "role" TEXT,
    "primaryIntent" TEXT,
    "orientation" TEXT,
    "minDurationS" INTEGER,
    "maxDurationS" INTEGER,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "fields" JSONB,
    "aiContext" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CreativeTemplate" ("aiContext", "baseContentId", "channels", "createdAt", "description", "fields", "id", "isActive", "isSystem", "maxDurationS", "minDurationS", "name", "orientation", "primaryIntent", "role", "storeId", "tags", "tenantId", "thumbnailUrl", "updatedAt") SELECT "aiContext", "baseContentId", "channels", "createdAt", "description", "fields", "id", "isActive", "isSystem", "maxDurationS", "minDurationS", "name", "orientation", "primaryIntent", "role", "storeId", "tags", "tenantId", "thumbnailUrl", "updatedAt" FROM "CreativeTemplate";
DROP TABLE "CreativeTemplate";
ALTER TABLE "new_CreativeTemplate" RENAME TO "CreativeTemplate";
CREATE INDEX "CreativeTemplate_tenantId_storeId_idx" ON "CreativeTemplate"("tenantId", "storeId");
CREATE INDEX "CreativeTemplate_role_primaryIntent_idx" ON "CreativeTemplate"("role", "primaryIntent");
CREATE INDEX "CreativeTemplate_orientation_idx" ON "CreativeTemplate"("orientation");
CREATE INDEX "CreativeTemplate_isActive_idx" ON "CreativeTemplate"("isActive");
CREATE INDEX "CreativeTemplate_isSystem_idx" ON "CreativeTemplate"("isSystem");
CREATE TABLE "new_Playlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'MEDIA',
    "name" TEXT NOT NULL,
    "tenantId" TEXT,
    "storeId" TEXT,
    "description" TEXT,
    "translations" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Playlist" ("active", "createdAt", "description", "id", "name", "storeId", "tenantId", "translations", "type", "updatedAt") SELECT "active", "createdAt", "description", "id", "name", "storeId", "tenantId", "translations", "type", "updatedAt" FROM "Playlist";
DROP TABLE "Playlist";
ALTER TABLE "new_Playlist" RENAME TO "Playlist";
CREATE INDEX "Playlist_type_idx" ON "Playlist"("type");
CREATE INDEX "Playlist_tenantId_storeId_idx" ON "Playlist"("tenantId", "storeId");
CREATE INDEX "Playlist_active_idx" ON "Playlist"("active");
CREATE INDEX "Playlist_type_active_idx" ON "Playlist"("type", "active");
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
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
INSERT INTO "new_Product" ("businessId", "category", "createdAt", "currency", "cutoutPath", "deletedAt", "description", "hasSam3Cutout", "id", "imageUrl", "images", "isPublished", "likeCount", "name", "price", "sku", "translations", "updatedAt", "viewCount") SELECT "businessId", "category", "createdAt", "currency", "cutoutPath", "deletedAt", "description", "hasSam3Cutout", "id", "imageUrl", "images", "isPublished", "likeCount", "name", "price", "sku", "translations", "updatedAt", "viewCount" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE INDEX "Product_businessId_idx" ON "Product"("businessId");
CREATE INDEX "Product_businessId_isPublished_idx" ON "Product"("businessId", "isPublished");
CREATE INDEX "Product_category_idx" ON "Product"("category");
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");
CREATE INDEX "Product_hasSam3Cutout_idx" ON "Product"("hasSam3Cutout");
CREATE TABLE "new_SignageAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "durationS" INTEGER NOT NULL,
    "tags" TEXT,
    "translations" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_SignageAsset" ("createdAt", "durationS", "id", "storeId", "tags", "tenantId", "translations", "type", "url") SELECT "createdAt", "durationS", "id", "storeId", "tags", "tenantId", "translations", "type", "url" FROM "SignageAsset";
DROP TABLE "SignageAsset";
ALTER TABLE "new_SignageAsset" RENAME TO "SignageAsset";
CREATE INDEX "SignageAsset_tenantId_idx" ON "SignageAsset"("tenantId");
CREATE INDEX "SignageAsset_storeId_idx" ON "SignageAsset"("storeId");
CREATE INDEX "SignageAsset_type_idx" ON "SignageAsset"("type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "GreetingCard_shareSlug_key" ON "GreetingCard"("shareSlug");

-- CreateIndex
CREATE INDEX "GreetingCard_ownerId_idx" ON "GreetingCard"("ownerId");

-- CreateIndex
CREATE INDEX "GreetingCard_shareSlug_idx" ON "GreetingCard"("shareSlug");

-- CreateIndex
CREATE INDEX "GreetingCard_isPublished_idx" ON "GreetingCard"("isPublished");

-- CreateIndex
CREATE INDEX "GreetingCard_type_idx" ON "GreetingCard"("type");
