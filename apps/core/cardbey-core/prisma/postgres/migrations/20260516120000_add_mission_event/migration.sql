-- MI / M3: append-only mission event stream (Agent Timeline).
-- Model exists in prisma/postgres/schema.prisma; was missing from Postgres migration history
-- (SQLite-only migration previously created MissionEvent under prisma/migrations/).

CREATE TABLE IF NOT EXISTS "MissionEvent" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "intentId" TEXT,
    "agent" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MissionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MissionEvent_missionId_createdAt_idx" ON "MissionEvent"("missionId", "createdAt");
CREATE INDEX IF NOT EXISTS "MissionEvent_intentId_createdAt_idx" ON "MissionEvent"("intentId", "createdAt");
