-- CreateTable MiChatThread
CREATE TABLE "MiChatThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "userId" TEXT,
    "preset" TEXT NOT NULL,
    "objectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable MiChatMessage
CREATE TABLE "MiChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MiChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MiChatThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MiChatThread_tenantId_idx" ON "MiChatThread"("tenantId");

-- CreateIndex
CREATE INDEX "MiChatThread_userId_idx" ON "MiChatThread"("userId");

-- CreateIndex
CREATE INDEX "MiChatThread_preset_idx" ON "MiChatThread"("preset");

-- CreateIndex
CREATE INDEX "MiChatThread_objectId_idx" ON "MiChatThread"("objectId");

-- CreateIndex
CREATE INDEX "MiChatThread_createdAt_idx" ON "MiChatThread"("createdAt");

-- CreateIndex
CREATE INDEX "MiChatMessage_threadId_idx" ON "MiChatMessage"("threadId");

-- CreateIndex
CREATE INDEX "MiChatMessage_createdAt_idx" ON "MiChatMessage"("createdAt");





