-- DANH: fix-hero-video-publish (SQLite)
ALTER TABLE "PublishedArtifactProjection" ADD COLUMN "heroVideoUrl" TEXT;
ALTER TABLE "PublishedArtifactProjection" ADD COLUMN "heroMediaType" TEXT;
