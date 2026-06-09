-- DANH: fix-hero-video-publish
ALTER TABLE "PublishedArtifactProjection" ADD COLUMN "heroVideoUrl" TEXT;
ALTER TABLE "PublishedArtifactProjection" ADD COLUMN "heroMediaType" TEXT;
