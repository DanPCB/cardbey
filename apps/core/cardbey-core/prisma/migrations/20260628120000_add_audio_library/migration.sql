-- Cardbey Audio Library — licensed audio index
CREATE TABLE "AudioLibrary" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "duration" INTEGER,
    "remoteUrl" TEXT,
    "storageUrl" TEXT,
    "storageKey" TEXT,
    "license" TEXT NOT NULL,
    "attribution" TEXT,
    "tags" JSONB,
    "metadata" JSONB,
    "storeId" TEXT,
    "uploadedBy" TEXT,
    "isSeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudioLibrary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AudioLibrary_externalId_key" ON "AudioLibrary"("externalId");
CREATE INDEX "AudioLibrary_source_idx" ON "AudioLibrary"("source");
CREATE INDEX "AudioLibrary_title_idx" ON "AudioLibrary"("title");
CREATE INDEX "AudioLibrary_storeId_idx" ON "AudioLibrary"("storeId");
CREATE INDEX "AudioLibrary_uploadedBy_idx" ON "AudioLibrary"("uploadedBy");
