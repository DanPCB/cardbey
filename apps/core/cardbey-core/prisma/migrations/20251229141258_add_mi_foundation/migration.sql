-- CreateTable
CREATE TABLE "MIObject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "ownerTenantId" TEXT,
    "ownerStoreId" TEXT,
    "identity" JSONB NOT NULL,
    "intent" JSONB,
    "behaviors" JSONB,
    "policy" JSONB,
    "memory" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MIEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "objectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "context" JSONB,
    "meta" JSONB,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "MIObject_kind_idx" ON "MIObject"("kind");

-- CreateIndex
CREATE INDEX "MIObject_ownerTenantId_idx" ON "MIObject"("ownerTenantId");

-- CreateIndex
CREATE INDEX "MIObject_ownerStoreId_idx" ON "MIObject"("ownerStoreId");

-- CreateIndex
CREATE INDEX "MIObject_ownerTenantId_ownerStoreId_idx" ON "MIObject"("ownerTenantId", "ownerStoreId");

-- CreateIndex
CREATE INDEX "MIEvent_objectId_idx" ON "MIEvent"("objectId");

-- CreateIndex
CREATE INDEX "MIEvent_kind_idx" ON "MIEvent"("kind");

-- CreateIndex
CREATE INDEX "MIEvent_timestamp_idx" ON "MIEvent"("timestamp");

-- CreateIndex
CREATE INDEX "MIEvent_objectId_kind_idx" ON "MIEvent"("objectId", "kind");
