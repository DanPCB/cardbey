-- Phase 3: checkpoint / conditional step metadata on MissionPipelineStep
ALTER TABLE "MissionPipelineStep" ADD COLUMN "stepKind" TEXT NOT NULL DEFAULT 'action';
ALTER TABLE "MissionPipelineStep" ADD COLUMN "configJson" JSONB;
