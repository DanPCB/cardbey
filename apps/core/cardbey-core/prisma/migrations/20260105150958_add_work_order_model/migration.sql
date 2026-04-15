-- CreateTable MiWorkOrder
CREATE TABLE "MiWorkOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "filesHint" TEXT,
    "status" TEXT NOT NULL,
    "resultJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "MiWorkOrder_threadId_idx" ON "MiWorkOrder"("threadId");

-- CreateIndex
CREATE INDEX "MiWorkOrder_status_idx" ON "MiWorkOrder"("status");

-- CreateIndex
CREATE INDEX "MiWorkOrder_createdAt_idx" ON "MiWorkOrder"("createdAt");
