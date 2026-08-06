-- Canonical store reviews: StoreReview + aggregate + reply + moderation audit.

CREATE TABLE IF NOT EXISTS "StoreReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "authorDisplayNameSnapshot" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceReferenceId" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "publicationStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "moderationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "languageCode" TEXT,
    "originalLanguage" TEXT,
    "originalText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "publishedAt" DATETIME,
    "removedAt" DATETIME,
    CONSTRAINT "StoreReview_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Business" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "StoreReview_storeId_publicationStatus_moderationStatus_idx"
  ON "StoreReview"("storeId", "publicationStatus", "moderationStatus");
CREATE INDEX IF NOT EXISTS "StoreReview_authorUserId_idx" ON "StoreReview"("authorUserId");
CREATE INDEX IF NOT EXISTS "StoreReview_sourceType_sourceReferenceId_idx"
  ON "StoreReview"("sourceType", "sourceReferenceId");
CREATE INDEX IF NOT EXISTS "StoreReview_storeId_authorUserId_idx" ON "StoreReview"("storeId", "authorUserId");

CREATE TABLE IF NOT EXISTS "StoreReviewAggregate" (
    "storeId" TEXT NOT NULL PRIMARY KEY,
    "publishedReviewCount" INTEGER NOT NULL DEFAULT 0,
    "averageRating" REAL NOT NULL DEFAULT 0,
    "averageRatingInternal" REAL NOT NULL DEFAULT 0,
    "rating1Count" INTEGER NOT NULL DEFAULT 0,
    "rating2Count" INTEGER NOT NULL DEFAULT 0,
    "rating3Count" INTEGER NOT NULL DEFAULT 0,
    "rating4Count" INTEGER NOT NULL DEFAULT 0,
    "rating5Count" INTEGER NOT NULL DEFAULT 0,
    "verifiedReviewCount" INTEGER NOT NULL DEFAULT 0,
    "latestReviewAt" DATETIME,
    "lastCalculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreReviewAggregate_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Business" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "StoreReviewReply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publicationStatus" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoreReviewReply_reviewId_fkey"
      FOREIGN KEY ("reviewId") REFERENCES "StoreReview" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoreReviewReply_reviewId_key" ON "StoreReviewReply"("reviewId");

CREATE TABLE IF NOT EXISTS "StoreReviewModeration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "previousStatus" TEXT,
    "newStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreReviewModeration_reviewId_fkey"
      FOREIGN KEY ("reviewId") REFERENCES "StoreReview" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "StoreReviewModeration_reviewId_idx" ON "StoreReviewModeration"("reviewId");
