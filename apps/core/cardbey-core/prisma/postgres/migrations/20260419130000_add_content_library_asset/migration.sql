-- ContentLibraryAsset (Postgres)
CREATE TABLE "ContentLibraryAsset" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentLibraryAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentLibraryAsset_storeId_idx" ON "ContentLibraryAsset"("storeId");

ALTER TABLE "ContentLibraryAsset" ADD CONSTRAINT "ContentLibraryAsset_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
