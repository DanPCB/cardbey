-- CreateTable
CREATE TABLE "Content" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "elements" JSONB NOT NULL,
    "settings" JSONB NOT NULL,
    "renderSlide" JSONB,
    "thumbnailUrl" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Content_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Media" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "storageKey" TEXT,
    "optimizedUrl" TEXT,
    "optimizedKey" TEXT,
    "isOptimized" BOOLEAN NOT NULL DEFAULT false,
    "optimizedAt" DATETIME,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationS" REAL,
    "sizeBytes" INTEGER NOT NULL,
    "missingFile" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Media" ("createdAt", "durationS", "height", "id", "kind", "mime", "missingFile", "sizeBytes", "url", "width") SELECT "createdAt", "durationS", "height", "id", "kind", "mime", "missingFile", "sizeBytes", "url", "width" FROM "Media";
DROP TABLE "Media";
ALTER TABLE "new_Media" RENAME TO "Media";
CREATE INDEX "Media_missingFile_idx" ON "Media"("missingFile");
CREATE INDEX "Media_isOptimized_idx" ON "Media"("isOptimized");
CREATE INDEX "Media_storageKey_idx" ON "Media"("storageKey");
CREATE TABLE "new_PlaylistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playlistId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "durationS" INTEGER NOT NULL DEFAULT 8,
    "fit" TEXT NOT NULL DEFAULT 'cover',
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "loop" BOOLEAN NOT NULL DEFAULT false,
    "displayOrientation" TEXT NOT NULL DEFAULT 'AUTO',
    "mediaId" TEXT NOT NULL,
    CONSTRAINT "PlaylistItem_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PlaylistItem" ("durationS", "fit", "id", "loop", "mediaId", "muted", "orderIndex", "playlistId") SELECT "durationS", "fit", "id", "loop", "mediaId", "muted", "orderIndex", "playlistId" FROM "PlaylistItem";
DROP TABLE "PlaylistItem";
ALTER TABLE "new_PlaylistItem" RENAME TO "PlaylistItem";
CREATE INDEX "PlaylistItem_playlistId_orderIndex_idx" ON "PlaylistItem"("playlistId", "orderIndex");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Content_userId_idx" ON "Content"("userId");

-- CreateIndex
CREATE INDEX "Content_createdAt_idx" ON "Content"("createdAt");
