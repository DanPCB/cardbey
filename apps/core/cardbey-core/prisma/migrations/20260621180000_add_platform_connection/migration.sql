-- CreateTable
CREATE TABLE "PlatformConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "credentialsEnc" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" DATETIME,
    "disconnectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformConnection_userId_platformId_key" ON "PlatformConnection"("userId", "platformId");
CREATE INDEX "PlatformConnection_userId_platformId_idx" ON "PlatformConnection"("userId", "platformId");
CREATE INDEX "PlatformConnection_userId_status_idx" ON "PlatformConnection"("userId", "status");
