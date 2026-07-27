CREATE TABLE IF NOT EXISTS "ExploreVideo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "videoUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "duration" INTEGER,
    "ctaIntent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS "ExploreVideo_status_idx" ON "ExploreVideo"("status");
CREATE INDEX IF NOT EXISTS "ExploreVideo_createdBy_idx" ON "ExploreVideo"("createdBy");
CREATE INDEX IF NOT EXISTS "ExploreVideo_priority_idx" ON "ExploreVideo"("priority");
