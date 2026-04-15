-- Mission: registry for agent-chat missions (id can match OrchestratorTask.id or stand alone)
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "context" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Mission_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Mission_tenantId_updatedAt_idx" ON "Mission"("tenantId", "updatedAt");
CREATE INDEX "Mission_createdByUserId_updatedAt_idx" ON "Mission"("createdByUserId", "updatedAt");
