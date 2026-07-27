-- Mission blackboard (append-only events per Mission). Model in prisma/postgres/schema.prisma
-- was not present in earlier Postgres migrations.

CREATE TABLE IF NOT EXISTS "MissionBlackboard" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "agentId" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MissionBlackboard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MissionBlackboard_missionId_seq_key" ON "MissionBlackboard"("missionId", "seq");
CREATE INDEX IF NOT EXISTS "MissionBlackboard_missionId_seq_idx" ON "MissionBlackboard"("missionId", "seq");
CREATE INDEX IF NOT EXISTS "MissionBlackboard_missionId_createdAt_idx" ON "MissionBlackboard"("missionId", "createdAt");
CREATE INDEX IF NOT EXISTS "MissionBlackboard_correlationId_idx" ON "MissionBlackboard"("correlationId");

DO $$
BEGIN
  ALTER TABLE "MissionBlackboard" ADD CONSTRAINT "MissionBlackboard_missionId_fkey"
    FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
