-- Manual migration: add MissionTask columns (normalizedLabel, agentKeyRecommended, lastRunId, meta)
-- and unique index. Use when "prisma migrate dev" fails due to shadow DB (e.g. AgentMessage order).
--
-- From apps/core/cardbey-core run:
--   npx prisma db execute --file prisma/manual_add_mission_task_columns.sql --schema prisma/schema.prisma
-- Then:
--   npx prisma generate
--
-- If a column already exists, you may see "duplicate column name"; run the remaining statements manually.

-- Add columns if not present (SQLite doesn't support IF NOT EXISTS for columns; ignore errors if already exist)
ALTER TABLE "MissionTask" ADD COLUMN "normalizedLabel" TEXT;
ALTER TABLE "MissionTask" ADD COLUMN "agentKeyRecommended" TEXT;
ALTER TABLE "MissionTask" ADD COLUMN "lastRunId" TEXT;
ALTER TABLE "MissionTask" ADD COLUMN "meta" TEXT;

-- Unique index for deduplication (missionId, sourceMessageId, normalizedLabel)
-- In SQLite, multiple NULLs in normalizedLabel are allowed in a unique index
CREATE UNIQUE INDEX IF NOT EXISTS "MissionTask_missionId_sourceMessageId_normalizedLabel_key"
  ON "MissionTask"("missionId", "sourceMessageId", "normalizedLabel");
