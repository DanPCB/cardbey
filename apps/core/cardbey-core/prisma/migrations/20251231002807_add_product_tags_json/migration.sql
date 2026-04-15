-- CreateTable
CREATE TABLE "PromoRegistration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instanceId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "meta" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "tags" JSONB NOT NULL DEFAULT [],
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
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PromoRegistration_instanceId_idx" ON "PromoRegistration"("instanceId");

-- CreateIndex
CREATE INDEX "PromoRegistration_publicId_idx" ON "PromoRegistration"("publicId");

-- CreateIndex
CREATE INDEX "PromoRegistration_email_idx" ON "PromoRegistration"("email");

-- CreateIndex
CREATE INDEX "PromoRegistration_phone_idx" ON "PromoRegistration"("phone");

-- CreateIndex
CREATE INDEX "PromoRegistration_instanceId_email_idx" ON "PromoRegistration"("instanceId", "email");

-- CreateIndex
CREATE INDEX "PromoRegistration_instanceId_phone_idx" ON "PromoRegistration"("instanceId", "phone");
