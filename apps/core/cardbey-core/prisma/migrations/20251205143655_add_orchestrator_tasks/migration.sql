-- CreateTable
CREATE TABLE "OrchestratorTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryPoint" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "insightId" TEXT,
    "status" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "result" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "OrchestratorTask_tenantId_createdAt_idx" ON "OrchestratorTask"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "OrchestratorTask_tenantId_status_idx" ON "OrchestratorTask"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OrchestratorTask_entryPoint_idx" ON "OrchestratorTask"("entryPoint");

-- CreateIndex
CREATE INDEX "OrchestratorTask_insightId_idx" ON "OrchestratorTask"("insightId");
