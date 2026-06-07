-- DANH: fix-hero-video-publish — projection table hero columns for public store reads
ALTER TABLE "PublishedArtifactProjection" ADD COLUMN IF NOT EXISTS "heroVideoUrl" TEXT;
ALTER TABLE "PublishedArtifactProjection" ADD COLUMN IF NOT EXISTS "heroMediaType" TEXT;
