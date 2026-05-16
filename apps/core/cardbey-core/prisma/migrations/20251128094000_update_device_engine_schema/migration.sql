-- CreateTable
CREATE TABLE "PromoRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "value" REAL NOT NULL,
    "startAt" DATETIME,
    "endAt" DATETIME,
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PromoRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "promoId" TEXT NOT NULL,
    "customerId" TEXT,
    "deviceId" TEXT,
    "redeemedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromoRedemption_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "PromoRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SignageAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "tags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PlaylistSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "deviceId" TEXT,
    "deviceGroupId" TEXT,
    "startAt" DATETIME,
    "endAt" DATETIME,
    "daysOfWeek" TEXT,
    "timeRange" TEXT,
    CONSTRAINT "PlaylistSchedule_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "pairingCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "name" TEXT,
    "model" TEXT,
    "location" TEXT,
    "appVersion" TEXT,
    "lastSeenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DeviceCapability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeviceCapability_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeviceStateSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "playlistVersion" TEXT,
    "storageFreeMb" INTEGER,
    "wifiStrength" INTEGER,
    "errorCodes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceStateSnapshot_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DevicePlaylistBinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "lastPushedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    CONSTRAINT "DevicePlaylistBinding_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Playlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'MEDIA',
    "name" TEXT NOT NULL,
    "tenantId" TEXT,
    "storeId" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Playlist" ("createdAt", "id", "name", "updatedAt") SELECT "createdAt", "id", "name", "updatedAt" FROM "Playlist";
DROP TABLE "Playlist";
ALTER TABLE "new_Playlist" RENAME TO "Playlist";
CREATE INDEX "Playlist_type_idx" ON "Playlist"("type");
CREATE INDEX "Playlist_tenantId_storeId_idx" ON "Playlist"("tenantId", "storeId");
CREATE INDEX "Playlist_active_idx" ON "Playlist"("active");
CREATE INDEX "Playlist_type_active_idx" ON "Playlist"("type", "active");
CREATE TABLE "new_PlaylistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playlistId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "durationS" INTEGER NOT NULL DEFAULT 8,
    "mediaId" TEXT,
    "fit" TEXT DEFAULT 'cover',
    "muted" BOOLEAN DEFAULT false,
    "loop" BOOLEAN DEFAULT false,
    "displayOrientation" TEXT DEFAULT 'AUTO',
    "assetId" TEXT,
    CONSTRAINT "PlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaylistItem_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaylistItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "SignageAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PlaylistItem" ("displayOrientation", "durationS", "fit", "id", "loop", "mediaId", "muted", "orderIndex", "playlistId") SELECT "displayOrientation", "durationS", "fit", "id", "loop", "mediaId", "muted", "orderIndex", "playlistId" FROM "PlaylistItem";
DROP TABLE "PlaylistItem";
ALTER TABLE "new_PlaylistItem" RENAME TO "PlaylistItem";
CREATE INDEX "PlaylistItem_playlistId_orderIndex_idx" ON "PlaylistItem"("playlistId", "orderIndex");
CREATE INDEX "PlaylistItem_mediaId_idx" ON "PlaylistItem"("mediaId");
CREATE INDEX "PlaylistItem_assetId_idx" ON "PlaylistItem"("assetId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PromoRule_tenantId_idx" ON "PromoRule"("tenantId");

-- CreateIndex
CREATE INDEX "PromoRule_storeId_idx" ON "PromoRule"("storeId");

-- CreateIndex
CREATE INDEX "PromoRule_active_idx" ON "PromoRule"("active");

-- CreateIndex
CREATE INDEX "PromoRule_startAt_endAt_idx" ON "PromoRule"("startAt", "endAt");

-- CreateIndex
CREATE INDEX "PromoRedemption_tenantId_idx" ON "PromoRedemption"("tenantId");

-- CreateIndex
CREATE INDEX "PromoRedemption_storeId_idx" ON "PromoRedemption"("storeId");

-- CreateIndex
CREATE INDEX "PromoRedemption_promoId_idx" ON "PromoRedemption"("promoId");

-- CreateIndex
CREATE INDEX "PromoRedemption_customerId_idx" ON "PromoRedemption"("customerId");

-- CreateIndex
CREATE INDEX "PromoRedemption_redeemedAt_idx" ON "PromoRedemption"("redeemedAt");

-- CreateIndex
CREATE INDEX "SignageAsset_tenantId_idx" ON "SignageAsset"("tenantId");

-- CreateIndex
CREATE INDEX "SignageAsset_storeId_idx" ON "SignageAsset"("storeId");

-- CreateIndex
CREATE INDEX "SignageAsset_type_idx" ON "SignageAsset"("type");

-- CreateIndex
CREATE INDEX "PlaylistSchedule_tenantId_idx" ON "PlaylistSchedule"("tenantId");

-- CreateIndex
CREATE INDEX "PlaylistSchedule_storeId_idx" ON "PlaylistSchedule"("storeId");

-- CreateIndex
CREATE INDEX "PlaylistSchedule_playlistId_idx" ON "PlaylistSchedule"("playlistId");

-- CreateIndex
CREATE INDEX "PlaylistSchedule_deviceId_idx" ON "PlaylistSchedule"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_pairingCode_key" ON "Device"("pairingCode");

-- CreateIndex
CREATE INDEX "Device_tenantId_idx" ON "Device"("tenantId");

-- CreateIndex
CREATE INDEX "Device_storeId_idx" ON "Device"("storeId");

-- CreateIndex
CREATE INDEX "Device_status_idx" ON "Device"("status");

-- CreateIndex
CREATE INDEX "Device_pairingCode_idx" ON "Device"("pairingCode");

-- CreateIndex
CREATE INDEX "Device_lastSeenAt_idx" ON "Device"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCapability_deviceId_key" ON "DeviceCapability"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceStateSnapshot_deviceId_createdAt_idx" ON "DeviceStateSnapshot"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "DevicePlaylistBinding_deviceId_idx" ON "DevicePlaylistBinding"("deviceId");

-- CreateIndex
CREATE INDEX "DevicePlaylistBinding_playlistId_idx" ON "DevicePlaylistBinding"("playlistId");

-- CreateIndex
CREATE INDEX "DevicePlaylistBinding_status_idx" ON "DevicePlaylistBinding"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DevicePlaylistBinding_deviceId_playlistId_key" ON "DevicePlaylistBinding"("deviceId", "playlistId");
