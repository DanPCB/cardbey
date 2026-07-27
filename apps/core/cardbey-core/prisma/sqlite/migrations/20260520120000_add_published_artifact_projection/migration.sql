-- Canonical published store projection (public read surfaces).
-- Required before 20260607120000_add_projection_hero_video_columns (shadow DB replay order).
CREATE TABLE IF NOT EXISTS "PublishedArtifactProjection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artifactType" TEXT NOT NULL DEFAULT 'business',
    "businessId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "projectionJson" JSONB NOT NULL,
    "sourceDraftId" TEXT,
    "publishRunId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PublishedArtifactProjection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PublishedArtifactProjection_businessId_key" ON "PublishedArtifactProjection"("businessId");
CREATE INDEX IF NOT EXISTS "PublishedArtifactProjection_slug_idx" ON "PublishedArtifactProjection"("slug");
CREATE INDEX IF NOT EXISTS "PublishedArtifactProjection_tenantId_slug_idx" ON "PublishedArtifactProjection"("tenantId", "slug");
