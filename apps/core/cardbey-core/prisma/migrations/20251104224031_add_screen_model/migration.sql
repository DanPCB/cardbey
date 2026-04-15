-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "hasBusiness" BOOLEAN NOT NULL DEFAULT false,
    "onboarding" TEXT,
    "roles" TEXT NOT NULL DEFAULT '["viewer"]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logo" TEXT,
    "region" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Business_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Demand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "context" TEXT,
    "fulfilled" BOOLEAN NOT NULL DEFAULT false,
    "fulfilledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Demand_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JourneyTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "category" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "JourneyStepTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "hint" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'INFO',
    "action" TEXT NOT NULL DEFAULT 'NONE',
    "templateId" TEXT NOT NULL,
    "paramsJson" TEXT,
    CONSTRAINT "JourneyStepTemplate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JourneyTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JourneyInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JourneyInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JourneyTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JourneyStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instanceId" TEXT NOT NULL,
    "stepTemplateId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "kind" TEXT NOT NULL DEFAULT 'INFO',
    "action" TEXT NOT NULL DEFAULT 'NONE',
    "paramsJson" TEXT,
    "resultJson" TEXT,
    "scheduledAt" DATETIME,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    CONSTRAINT "JourneyStep_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "JourneyInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JourneyStep_stepTemplateId_fkey" FOREIGN KEY ("stepTemplateId") REFERENCES "JourneyStepTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlannerTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "runAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlannerTask_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "JourneyInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssistantSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "reason" TEXT,
    "score" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EventLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" TEXT
);

-- CreateTable
CREATE TABLE "SuggestionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "node" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "confidence" REAL NOT NULL,
    "impact" TEXT,
    "actions" TEXT NOT NULL,
    "sourceEvent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "appliedBy" TEXT,
    "appliedAt" DATETIME,
    "latencyZoneAMs" INTEGER,
    "latencyZoneBMs" INTEGER,
    "latencyEndToEndMs" INTEGER,
    "tenantId" TEXT
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyHash" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PriceChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "suggestionId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "oldPrice" REAL,
    "newPrice" REAL,
    "deltaPercent" REAL NOT NULL,
    "duration" TEXT NOT NULL,
    "testGroup" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" DATETIME,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "ReorderRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "suggestionId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priority" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderedAt" DATETIME,
    "receivedAt" DATETIME
);

-- CreateTable
CREATE TABLE "CreativeRefreshTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "suggestionId" TEXT NOT NULL,
    "banner" TEXT,
    "reason" TEXT NOT NULL,
    "currentCTR" REAL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Screen" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "lastSeenAt" DATETIME,
    "pairingCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Business_userId_key" ON "Business"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

-- CreateIndex
CREATE INDEX "Business_slug_idx" ON "Business"("slug");

-- CreateIndex
CREATE INDEX "Demand_userId_idx" ON "Demand"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyTemplate_slug_key" ON "JourneyTemplate"("slug");

-- CreateIndex
CREATE INDEX "JourneyTemplate_slug_idx" ON "JourneyTemplate"("slug");

-- CreateIndex
CREATE INDEX "JourneyTemplate_category_idx" ON "JourneyTemplate"("category");

-- CreateIndex
CREATE INDEX "JourneyStepTemplate_templateId_orderIndex_idx" ON "JourneyStepTemplate"("templateId", "orderIndex");

-- CreateIndex
CREATE INDEX "JourneyInstance_userId_idx" ON "JourneyInstance"("userId");

-- CreateIndex
CREATE INDEX "JourneyInstance_status_idx" ON "JourneyInstance"("status");

-- CreateIndex
CREATE INDEX "JourneyStep_instanceId_orderIndex_idx" ON "JourneyStep"("instanceId", "orderIndex");

-- CreateIndex
CREATE INDEX "JourneyStep_status_idx" ON "JourneyStep"("status");

-- CreateIndex
CREATE INDEX "PlannerTask_userId_idx" ON "PlannerTask"("userId");

-- CreateIndex
CREATE INDEX "PlannerTask_status_runAt_idx" ON "PlannerTask"("status", "runAt");

-- CreateIndex
CREATE INDEX "AssistantSuggestion_userId_mode_idx" ON "AssistantSuggestion"("userId", "mode");

-- CreateIndex
CREATE INDEX "AssistantSuggestion_score_idx" ON "AssistantSuggestion"("score");

-- CreateIndex
CREATE INDEX "EventLog_kind_idx" ON "EventLog"("kind");

-- CreateIndex
CREATE INDEX "EventLog_zone_idx" ON "EventLog"("zone");

-- CreateIndex
CREATE INDEX "EventLog_occurredAt_idx" ON "EventLog"("occurredAt");

-- CreateIndex
CREATE INDEX "SuggestionLog_node_idx" ON "SuggestionLog"("node");

-- CreateIndex
CREATE INDEX "SuggestionLog_status_idx" ON "SuggestionLog"("status");

-- CreateIndex
CREATE INDEX "SuggestionLog_createdAt_idx" ON "SuggestionLog"("createdAt");

-- CreateIndex
CREATE INDEX "SuggestionLog_tenantId_idx" ON "SuggestionLog"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_keyHash_key" ON "IdempotencyKey"("keyHash");

-- CreateIndex
CREATE INDEX "IdempotencyKey_keyHash_idx" ON "IdempotencyKey"("keyHash");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE INDEX "PriceChange_suggestionId_idx" ON "PriceChange"("suggestionId");

-- CreateIndex
CREATE INDEX "PriceChange_sku_idx" ON "PriceChange"("sku");

-- CreateIndex
CREATE INDEX "PriceChange_status_idx" ON "PriceChange"("status");

-- CreateIndex
CREATE INDEX "ReorderRequest_suggestionId_idx" ON "ReorderRequest"("suggestionId");

-- CreateIndex
CREATE INDEX "ReorderRequest_sku_idx" ON "ReorderRequest"("sku");

-- CreateIndex
CREATE INDEX "ReorderRequest_status_idx" ON "ReorderRequest"("status");

-- CreateIndex
CREATE INDEX "CreativeRefreshTask_suggestionId_idx" ON "CreativeRefreshTask"("suggestionId");

-- CreateIndex
CREATE INDEX "CreativeRefreshTask_status_idx" ON "CreativeRefreshTask"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Screen_pairingCode_key" ON "Screen"("pairingCode");

-- CreateIndex
CREATE INDEX "Screen_status_idx" ON "Screen"("status");

-- CreateIndex
CREATE INDEX "Screen_lastSeenAt_idx" ON "Screen"("lastSeenAt");
