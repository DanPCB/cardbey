-- ContentLibraryAsset: saved logos/icons from Content Library
CREATE TABLE "ContentLibraryAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "category" TEXT,
    "tags" JSONB,
    "license" TEXT,
    "metadata" JSONB,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentLibraryAsset_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ContentLibraryAsset_storeId_idx" ON "ContentLibraryAsset"("storeId");
