-- Fix P2021: Section table was dropped but Product still had sectionId FK to Section.
-- Recreate Product without sectionId and itemType so DB matches current Prisma schema.
-- Does not touch Business (avoids P3018 from full schema sync).

-- Drop Section table if it still exists (idempotent; may already be dropped)
PRAGMA foreign_keys=OFF;
DROP TABLE IF EXISTS "Section";

-- Recreate Product without sectionId and itemType
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
INSERT INTO "new_Product" ("id", "businessId", "name", "normalizedName", "description", "translations", "price", "currency", "category", "imageUrl", "sku", "isPublished", "images", "viewCount", "likeCount", "hasSam3Cutout", "cutoutPath", "deletedAt", "createdAt", "updatedAt")
SELECT "id", "businessId", "name", "normalizedName", "description", "translations", "price", "currency", "category", "imageUrl", "sku", "isPublished", "images", "viewCount", "likeCount", "hasSam3Cutout", "cutoutPath", "deletedAt", "createdAt", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE INDEX "Product_businessId_idx" ON "Product"("businessId");
CREATE INDEX "Product_businessId_isPublished_idx" ON "Product"("businessId", "isPublished");
CREATE INDEX "Product_category_idx" ON "Product"("category");
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");
CREATE INDEX "Product_hasSam3Cutout_idx" ON "Product"("hasSam3Cutout");
CREATE UNIQUE INDEX "Product_businessId_normalizedName_key" ON "Product"("businessId", "normalizedName");
PRAGMA foreign_keys=ON;
