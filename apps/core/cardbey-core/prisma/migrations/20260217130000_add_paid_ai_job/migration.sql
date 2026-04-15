-- CreateTable: idempotency for paid AI actions (one running job per userId+refId+actionName)
CREATE TABLE "PaidAiJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "actionName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "PaidAiJob_userId_refId_actionName_key" ON "PaidAiJob"("userId", "refId", "actionName");
CREATE INDEX "PaidAiJob_userId_status_idx" ON "PaidAiJob"("userId", "status");
CREATE INDEX "PaidAiJob_refId_idx" ON "PaidAiJob"("refId");
