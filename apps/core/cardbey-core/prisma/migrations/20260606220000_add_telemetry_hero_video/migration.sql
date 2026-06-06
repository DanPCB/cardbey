-- Hero video client telemetry (dashboard upload verify / playback)
CREATE TABLE "TelemetryHeroVideo" (
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

CREATE INDEX "TelemetryHeroVideo_eventType_idx" ON "TelemetryHeroVideo"("eventType");
CREATE INDEX "TelemetryHeroVideo_createdAt_idx" ON "TelemetryHeroVideo"("createdAt");
CREATE INDEX "TelemetryHeroVideo_storageKey_idx" ON "TelemetryHeroVideo"("storageKey");
CREATE INDEX "TelemetryHeroVideo_environment_idx" ON "TelemetryHeroVideo"("environment");
