-- Phase 1: Make One Workflow Real (workflowKey = store_creation)
-- No changes to DraftStore table; new tables only. Safe for generate/commit/publish flow.

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowKey" TEXT NOT NULL,
    "draftStoreId" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "status" TEXT NOT NULL,
    "failureCode" TEXT,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowRun_draftStoreId_fkey" FOREIGN KEY ("draftStoreId") REFERENCES "DraftStore" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkflowIncident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowKey" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "draftStoreId" TEXT,
    "runId" TEXT,
    "reasonKey" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "WorkflowIncident_draftStoreId_fkey" FOREIGN KEY ("draftStoreId") REFERENCES "DraftStore" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkflowIncident_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkflowReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowKey" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowKey_idx" ON "WorkflowRun"("workflowKey");
CREATE INDEX "WorkflowRun_draftStoreId_idx" ON "WorkflowRun"("draftStoreId");
CREATE INDEX "WorkflowRun_startedAt_idx" ON "WorkflowRun"("startedAt");
CREATE INDEX "WorkflowRun_status_idx" ON "WorkflowRun"("status");

-- CreateIndex
CREATE INDEX "WorkflowIncident_workflowKey_idx" ON "WorkflowIncident"("workflowKey");
CREATE INDEX "WorkflowIncident_draftStoreId_idx" ON "WorkflowIncident"("draftStoreId");
CREATE INDEX "WorkflowIncident_runId_idx" ON "WorkflowIncident"("runId");
CREATE INDEX "WorkflowIncident_createdAt_idx" ON "WorkflowIncident"("createdAt");

-- CreateIndex
CREATE INDEX "WorkflowReport_workflowKey_idx" ON "WorkflowReport"("workflowKey");
CREATE INDEX "WorkflowReport_periodStart_periodEnd_idx" ON "WorkflowReport"("periodStart", "periodEnd");
