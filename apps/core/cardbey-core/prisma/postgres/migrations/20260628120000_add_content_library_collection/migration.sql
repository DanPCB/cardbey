-- ContentLibraryCollection: grouped store media assets
CREATE TABLE "ContentLibraryCollection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'custom',
    "assets" JSONB NOT NULL DEFAULT '[]',
    "layout" TEXT NOT NULL DEFAULT 'grid',
    "metadata" JSONB,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentLibraryCollection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentLibraryCollection_storeId_idx" ON "ContentLibraryCollection"("storeId");

ALTER TABLE "ContentLibraryCollection" ADD CONSTRAINT "ContentLibraryCollection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
