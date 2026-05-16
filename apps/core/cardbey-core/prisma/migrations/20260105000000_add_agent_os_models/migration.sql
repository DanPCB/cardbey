-- CreateTable
CREATE TABLE "MiToolAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "toolName" TEXT NOT NULL,
    "preset" TEXT,
    "tenantId" TEXT,
    "userId" TEXT,
    "objectId" TEXT,
    "inputJson" TEXT NOT NULL,
    "outputJson" TEXT,
    "ok" BOOLEAN NOT NULL,
    "errorClass" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "latencyMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MiIdempotency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "toolName" TEXT NOT NULL,
    "keyFields" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "outputJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MiConfirmToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "MiToolAudit_toolName_idx" ON "MiToolAudit"("toolName");

-- CreateIndex
CREATE INDEX "MiToolAudit_preset_idx" ON "MiToolAudit"("preset");

-- CreateIndex
CREATE INDEX "MiToolAudit_tenantId_createdAt_idx" ON "MiToolAudit"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "MiToolAudit_userId_createdAt_idx" ON "MiToolAudit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MiToolAudit_objectId_idx" ON "MiToolAudit"("objectId");

-- CreateIndex
CREATE UNIQUE INDEX "MiIdempotency_keyHash_key" ON "MiIdempotency"("keyHash");

-- CreateIndex
CREATE INDEX "MiIdempotency_toolName_keyHash_idx" ON "MiIdempotency"("toolName", "keyHash");

-- CreateIndex
CREATE INDEX "MiIdempotency_expiresAt_idx" ON "MiIdempotency"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MiConfirmToken_token_key" ON "MiConfirmToken"("token");

-- CreateIndex
CREATE INDEX "MiConfirmToken_toolName_inputHash_idx" ON "MiConfirmToken"("toolName", "inputHash");

-- CreateIndex
CREATE INDEX "MiConfirmToken_expiresAt_idx" ON "MiConfirmToken"("expiresAt");





