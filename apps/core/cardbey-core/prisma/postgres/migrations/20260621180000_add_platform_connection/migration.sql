-- CreateTable
CREATE TABLE "PlatformConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "credentialsEnc" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformConnection_userId_platformId_key" ON "PlatformConnection"("userId", "platformId");
CREATE INDEX "PlatformConnection_userId_platformId_idx" ON "PlatformConnection"("userId", "platformId");
CREATE INDEX "PlatformConnection_userId_status_idx" ON "PlatformConnection"("userId", "status");
