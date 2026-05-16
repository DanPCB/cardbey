-- CreateTable
CREATE TABLE "FunnelEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "step" TEXT NOT NULL,
    "correlationId" TEXT,
    "actorKey" TEXT,
    "draftId" TEXT,
    "storeId" TEXT,
    "errorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "FunnelEvent_step_idx" ON "FunnelEvent"("step");

-- CreateIndex
CREATE INDEX "FunnelEvent_correlationId_idx" ON "FunnelEvent"("correlationId");

-- CreateIndex
CREATE INDEX "FunnelEvent_createdAt_idx" ON "FunnelEvent"("createdAt");
