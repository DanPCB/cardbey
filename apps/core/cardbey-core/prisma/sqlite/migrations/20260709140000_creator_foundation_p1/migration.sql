-- Creator Foundation Phase 1
CREATE TABLE "Creator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "username" TEXT NOT NULL,
    "avatar" TEXT,
    "banner" TEXT,
    "bio" TEXT,
    "languages" TEXT,
    "country" TEXT,
    "categories" TEXT,
    "verifiedStatus" TEXT NOT NULL DEFAULT 'unverified',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalPublishedMinutes" REAL NOT NULL DEFAULT 0,
    "totalVideos" INTEGER NOT NULL DEFAULT 0,
    "totalArticles" INTEGER NOT NULL DEFAULT 0,
    "totalViews" INTEGER NOT NULL DEFAULT 0,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "following" INTEGER NOT NULL DEFAULT 0,
    "creatorLevel" INTEGER NOT NULL DEFAULT 1,
    "creatorStatus" TEXT NOT NULL DEFAULT 'active',
    "qualificationProgress" REAL NOT NULL DEFAULT 0,
    "isQualified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Creator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CreatorContent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT,
    "durationSeconds" INTEGER,
    "publishedAt" DATETIME,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "thumbnail" TEXT,
    "mediaUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "bookmarks" INTEGER NOT NULL DEFAULT 0,
    "runtimeMissionId" TEXT,
    "sourceType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreatorContent_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Creator_userId_key" ON "Creator"("userId");
CREATE UNIQUE INDEX "Creator_username_key" ON "Creator"("username");
CREATE INDEX "Creator_username_idx" ON "Creator"("username");
CREATE INDEX "Creator_creatorStatus_idx" ON "Creator"("creatorStatus");
CREATE INDEX "Creator_joinedAt_idx" ON "Creator"("joinedAt");
CREATE INDEX "CreatorContent_creatorId_idx" ON "CreatorContent"("creatorId");
CREATE INDEX "CreatorContent_status_idx" ON "CreatorContent"("status");
CREATE INDEX "CreatorContent_type_idx" ON "CreatorContent"("type");
CREATE INDEX "CreatorContent_publishedAt_idx" ON "CreatorContent"("publishedAt");
