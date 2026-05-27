-- Publish snapshot source-of-truth (PUBLISH_SNAPSHOT_V1)
ALTER TABLE "DraftStore" ADD COLUMN IF NOT EXISTS "publishSnapshot" JSONB;
ALTER TABLE "DraftStore" ADD COLUMN IF NOT EXISTS "publishSnapshotVersion" INTEGER NOT NULL DEFAULT 0;
