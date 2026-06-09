CREATE TABLE IF NOT EXISTS "TelemetryNavigation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "userId" TEXT,
    "userRole" TEXT,
    "sessionId" TEXT,
    "fromPath" TEXT,
    "toPath" TEXT,
    "targetSection" TEXT,
    "searchQuery" TEXT,
    "timeOnPageMs" INTEGER,
    "environment" TEXT,
    "metadata" TEXT,
    "clientTs" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "TelemetryNavigation_eventType_idx" ON "TelemetryNavigation"("eventType");
CREATE INDEX IF NOT EXISTS "TelemetryNavigation_createdAt_idx" ON "TelemetryNavigation"("createdAt");
CREATE INDEX IF NOT EXISTS "TelemetryNavigation_userId_idx" ON "TelemetryNavigation"("userId");
CREATE INDEX IF NOT EXISTS "TelemetryNavigation_sessionId_idx" ON "TelemetryNavigation"("sessionId");
CREATE INDEX IF NOT EXISTS "TelemetryNavigation_userRole_idx" ON "TelemetryNavigation"("userRole");
