-- Publish snapshot source-of-truth (PUBLISH_SNAPSHOT_V1)
ALTER TABLE "DraftStore" ADD COLUMN "publishSnapshot" TEXT;
ALTER TABLE "DraftStore" ADD COLUMN "publishSnapshotVersion" INTEGER NOT NULL DEFAULT 0;
