-- Public feed / storefront interaction aggregates (views, loves, claps, shares).

CREATE TABLE IF NOT EXISTS "ContentInteractionMetrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentType" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "storeId" TEXT,
    "artifactId" TEXT,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "lovesCount" INTEGER NOT NULL DEFAULT 0,
    "clapsCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "sharesCount" INTEGER NOT NULL DEFAULT 0,
    "bookingsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContentInteractionMetrics_contentType_contentId_key"
  ON "ContentInteractionMetrics"("contentType", "contentId");
CREATE INDEX IF NOT EXISTS "ContentInteractionMetrics_storeId_idx"
  ON "ContentInteractionMetrics"("storeId");
CREATE INDEX IF NOT EXISTS "ContentInteractionMetrics_artifactId_idx"
  ON "ContentInteractionMetrics"("artifactId");

CREATE TABLE IF NOT EXISTS "ContentInteractionViewerState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "metricsId" TEXT NOT NULL,
    "viewerKey" TEXT NOT NULL,
    "loved" BOOLEAN NOT NULL DEFAULT false,
    "clapAdds" INTEGER NOT NULL DEFAULT 0,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "viewed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentInteractionViewerState_metricsId_fkey"
      FOREIGN KEY ("metricsId") REFERENCES "ContentInteractionMetrics" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContentInteractionViewerState_metricsId_viewerKey_key"
  ON "ContentInteractionViewerState"("metricsId", "viewerKey");
CREATE INDEX IF NOT EXISTS "ContentInteractionViewerState_viewerKey_idx"
  ON "ContentInteractionViewerState"("viewerKey");
