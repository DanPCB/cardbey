-- CreateTable
CREATE TABLE "DeviceAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "message" TEXT,
    "deviceType" TEXT,
    "ip" TEXT,
    "engineVersion" TEXT,
    "env" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "DeviceAlert_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Screen" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fingerprint" TEXT NOT NULL,
    "name" TEXT,
    "location" TEXT,
    "paired" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "statusText" TEXT,
    "lastSeen" DATETIME,
    "deletedAt" DATETIME,
    "orientation" TEXT NOT NULL DEFAULT 'horizontal',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "assignedPlaylistId" TEXT,
    "currentAsset" TEXT,
    "currentPlaylistId" TEXT,
    CONSTRAINT "Screen_assignedPlaylistId_fkey" FOREIGN KEY ("assignedPlaylistId") REFERENCES "Playlist" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Screen" ("assignedPlaylistId", "createdAt", "currentAsset", "currentPlaylistId", "deletedAt", "fingerprint", "id", "lastSeen", "location", "name", "paired", "status", "statusText", "updatedAt") SELECT "assignedPlaylistId", "createdAt", "currentAsset", "currentPlaylistId", "deletedAt", "fingerprint", "id", "lastSeen", "location", "name", "paired", "status", "statusText", "updatedAt" FROM "Screen";
DROP TABLE "Screen";
ALTER TABLE "new_Screen" RENAME TO "Screen";
CREATE UNIQUE INDEX "Screen_fingerprint_key" ON "Screen"("fingerprint");
CREATE INDEX "Screen_deletedAt_idx" ON "Screen"("deletedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DeviceAlert_deviceId_idx" ON "DeviceAlert"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceAlert_deviceId_createdAt_idx" ON "DeviceAlert"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceAlert_type_idx" ON "DeviceAlert"("type");

-- CreateIndex
CREATE INDEX "DeviceAlert_status_idx" ON "DeviceAlert"("status");

-- CreateIndex
CREATE INDEX "DeviceAlert_createdAt_idx" ON "DeviceAlert"("createdAt");
