-- Hero video client telemetry (dashboard upload verify / playback)
CREATE TABLE IF NOT EXISTS "TelemetryHeroVideo" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "url" TEXT,
    "storageKey" TEXT,
    "attemptNumber" INTEGER,
    "httpStatus" INTEGER,
    "durationMs" INTEGER,
    "errorCode" INTEGER,
    "environment" TEXT,
    "userId" TEXT,
    "clientTs" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelemetryHeroVideo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TelemetryHeroVideo_eventType_idx" ON "TelemetryHeroVideo"("eventType");
CREATE INDEX IF NOT EXISTS "TelemetryHeroVideo_createdAt_idx" ON "TelemetryHeroVideo"("createdAt");
CREATE INDEX IF NOT EXISTS "TelemetryHeroVideo_storageKey_idx" ON "TelemetryHeroVideo"("storageKey");
CREATE INDEX IF NOT EXISTS "TelemetryHeroVideo_environment_idx" ON "TelemetryHeroVideo"("environment");
