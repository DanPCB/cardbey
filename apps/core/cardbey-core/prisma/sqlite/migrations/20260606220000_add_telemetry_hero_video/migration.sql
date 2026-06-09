CREATE TABLE IF NOT EXISTS "TelemetryHeroVideo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "url" TEXT,
    "storageKey" TEXT,
    "attemptNumber" INTEGER,
    "httpStatus" INTEGER,
    "durationMs" INTEGER,
    "errorCode" INTEGER,
    "environment" TEXT,
    "userId" TEXT,
    "clientTs" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "TelemetryHeroVideo_eventType_idx" ON "TelemetryHeroVideo"("eventType");
CREATE INDEX IF NOT EXISTS "TelemetryHeroVideo_createdAt_idx" ON "TelemetryHeroVideo"("createdAt");
CREATE INDEX IF NOT EXISTS "TelemetryHeroVideo_storageKey_idx" ON "TelemetryHeroVideo"("storageKey");
CREATE INDEX IF NOT EXISTS "TelemetryHeroVideo_environment_idx" ON "TelemetryHeroVideo"("environment");
