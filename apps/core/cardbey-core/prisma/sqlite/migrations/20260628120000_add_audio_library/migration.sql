-- Cardbey Audio Library — licensed audio index
CREATE TABLE "AudioLibrary" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "tags" TEXT,
    "metadata" TEXT,
    "storeId" TEXT,
    "uploadedBy" TEXT,
    "isSeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "AudioLibrary_externalId_key" ON "AudioLibrary"("externalId");
CREATE INDEX "AudioLibrary_source_idx" ON "AudioLibrary"("source");
CREATE INDEX "AudioLibrary_title_idx" ON "AudioLibrary"("title");
CREATE INDEX "AudioLibrary_storeId_idx" ON "AudioLibrary"("storeId");
CREATE INDEX "AudioLibrary_uploadedBy_idx" ON "AudioLibrary"("uploadedBy");
