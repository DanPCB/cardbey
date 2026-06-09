CREATE TABLE IF NOT EXISTS "ExploreVideo" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExploreVideo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExploreVideo_status_idx" ON "ExploreVideo"("status");
CREATE INDEX IF NOT EXISTS "ExploreVideo_createdBy_idx" ON "ExploreVideo"("createdBy");
CREATE INDEX IF NOT EXISTS "ExploreVideo_priority_idx" ON "ExploreVideo"("priority");
