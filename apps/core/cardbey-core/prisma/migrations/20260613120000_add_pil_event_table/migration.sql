-- PIL Phase B.1 — platform intelligence events (SQLite)
CREATE TABLE IF NOT EXISTS "PilEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT,
    "userId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "storeId" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "PilEvent_type_timestamp_idx" ON "PilEvent"("type", "timestamp");
CREATE INDEX IF NOT EXISTS "PilEvent_sessionId_idx" ON "PilEvent"("sessionId");
CREATE INDEX IF NOT EXISTS "PilEvent_userId_idx" ON "PilEvent"("userId");
CREATE INDEX IF NOT EXISTS "PilEvent_storeId_timestamp_idx" ON "PilEvent"("storeId", "timestamp");
CREATE INDEX IF NOT EXISTS "PilEvent_entityType_entityId_idx" ON "PilEvent"("entityType", "entityId");
