-- Columns present in prisma/postgres/schema.prisma but never added by prior Postgres migrations.
-- (SQLite dev migrations added these; Postgres baseline / phase migrations omitted them.)
-- Idempotent for safe re-deploy on staging.

ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "showOwnerProfile" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CampaignV2" ADD COLUMN IF NOT EXISTS "allowedChannels" JSONB;

ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "lastPlaybackReportAt" TIMESTAMP(3);
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "playbackReportIsPlaying" BOOLEAN;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "playbackReportState" TEXT;

ALTER TABLE "OrchestratorTask" ADD COLUMN IF NOT EXISTS "missionId" TEXT;

CREATE INDEX IF NOT EXISTS "OrchestratorTask_missionId_idx" ON "OrchestratorTask"("missionId");
