-- CreateTable
CREATE TABLE "LoyaltyProgram" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stampsRequired" INTEGER NOT NULL,
    "reward" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LoyaltyStamp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "rewarded" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyStamp_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LoyaltyProgram" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoyaltyReward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "reward" TEXT NOT NULL,
    "redeemedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "fullName" TEXT,
    "handle" TEXT,
    "avatarUrl" TEXT,
    "accountType" TEXT,
    "tagline" TEXT,
    "hasBusiness" BOOLEAN NOT NULL DEFAULT false,
    "onboarding" TEXT,
    "roles" TEXT NOT NULL DEFAULT '["viewer"]',
    "role" TEXT NOT NULL DEFAULT 'owner',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "verificationExpires" DATETIME,
    "resetToken" TEXT,
    "resetExpires" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("accountType", "avatarUrl", "createdAt", "displayName", "email", "fullName", "handle", "hasBusiness", "id", "onboarding", "passwordHash", "roles", "tagline", "updatedAt") SELECT "accountType", "avatarUrl", "createdAt", "displayName", "email", "fullName", "handle", "hasBusiness", "id", "onboarding", "passwordHash", "roles", "tagline", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE INDEX "User_handle_idx" ON "User"("handle");
CREATE INDEX "User_verificationToken_idx" ON "User"("verificationToken");
CREATE INDEX "User_resetToken_idx" ON "User"("resetToken");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "LoyaltyProgram_tenantId_idx" ON "LoyaltyProgram"("tenantId");

-- CreateIndex
CREATE INDEX "LoyaltyProgram_storeId_idx" ON "LoyaltyProgram"("storeId");

-- CreateIndex
CREATE INDEX "LoyaltyProgram_expiresAt_idx" ON "LoyaltyProgram"("expiresAt");

-- CreateIndex
CREATE INDEX "LoyaltyStamp_tenantId_idx" ON "LoyaltyStamp"("tenantId");

-- CreateIndex
CREATE INDEX "LoyaltyStamp_storeId_idx" ON "LoyaltyStamp"("storeId");

-- CreateIndex
CREATE INDEX "LoyaltyStamp_programId_idx" ON "LoyaltyStamp"("programId");

-- CreateIndex
CREATE INDEX "LoyaltyStamp_customerId_idx" ON "LoyaltyStamp"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyStamp_tenantId_storeId_programId_customerId_key" ON "LoyaltyStamp"("tenantId", "storeId", "programId", "customerId");

-- CreateIndex
CREATE INDEX "LoyaltyReward_tenantId_idx" ON "LoyaltyReward"("tenantId");

-- CreateIndex
CREATE INDEX "LoyaltyReward_storeId_idx" ON "LoyaltyReward"("storeId");

-- CreateIndex
CREATE INDEX "LoyaltyReward_programId_idx" ON "LoyaltyReward"("programId");

-- CreateIndex
CREATE INDEX "LoyaltyReward_customerId_idx" ON "LoyaltyReward"("customerId");

-- CreateIndex
CREATE INDEX "LoyaltyReward_redeemedAt_idx" ON "LoyaltyReward"("redeemedAt");
