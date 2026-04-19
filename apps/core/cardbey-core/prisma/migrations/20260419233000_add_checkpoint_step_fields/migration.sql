-- Phase 3: pipelineConfig on MissionPipeline; outputsJson + metadata on MissionPipelineStep
-- (stepKind + configJson are added by 20260419180000_mission_pipeline_step_checkpoint_fields)

ALTER TABLE "MissionPipeline" ADD COLUMN "pipelineConfig" JSONB;

ALTER TABLE "MissionPipelineStep" ADD COLUMN "outputsJson" JSONB;
ALTER TABLE "MissionPipelineStep" ADD COLUMN "metadata" JSONB;
