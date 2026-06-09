CREATE TABLE "TelemetryNavigation" (
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

CREATE INDEX "TelemetryNavigation_eventType_idx" ON "TelemetryNavigation"("eventType");
CREATE INDEX "TelemetryNavigation_createdAt_idx" ON "TelemetryNavigation"("createdAt");
CREATE INDEX "TelemetryNavigation_userId_idx" ON "TelemetryNavigation"("userId");
CREATE INDEX "TelemetryNavigation_sessionId_idx" ON "TelemetryNavigation"("sessionId");
CREATE INDEX "TelemetryNavigation_userRole_idx" ON "TelemetryNavigation"("userRole");
