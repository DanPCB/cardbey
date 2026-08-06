-- Canonical store reviews: StoreReview + aggregate + reply + moderation audit.

CREATE TABLE "StoreReview" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    CONSTRAINT "StoreReview_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoreReview_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "StoreReview_storeId_publicationStatus_moderationStatus_idx"
  ON "StoreReview"("storeId", "publicationStatus", "moderationStatus");
CREATE INDEX "StoreReview_authorUserId_idx" ON "StoreReview"("authorUserId");
CREATE INDEX "StoreReview_sourceType_sourceReferenceId_idx"
  ON "StoreReview"("sourceType", "sourceReferenceId");
CREATE INDEX "StoreReview_storeId_authorUserId_idx" ON "StoreReview"("storeId", "authorUserId");

CREATE TABLE "StoreReviewAggregate" (
    "storeId" TEXT NOT NULL,
    "publishedReviewCount" INTEGER NOT NULL DEFAULT 0,
    "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageRatingInternal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating1Count" INTEGER NOT NULL DEFAULT 0,
    "rating2Count" INTEGER NOT NULL DEFAULT 0,
    "rating3Count" INTEGER NOT NULL DEFAULT 0,
    "rating4Count" INTEGER NOT NULL DEFAULT 0,
    "rating5Count" INTEGER NOT NULL DEFAULT 0,
    "verifiedReviewCount" INTEGER NOT NULL DEFAULT 0,
    "latestReviewAt" TIMESTAMP(3),
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreReviewAggregate_pkey" PRIMARY KEY ("storeId"),
    CONSTRAINT "StoreReviewAggregate_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "StoreReviewReply" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publicationStatus" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreReviewReply_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoreReviewReply_reviewId_fkey"
      FOREIGN KEY ("reviewId") REFERENCES "StoreReview"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StoreReviewReply_reviewId_key" ON "StoreReviewReply"("reviewId");

CREATE TABLE "StoreReviewModeration" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "previousStatus" TEXT,
    "newStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreReviewModeration_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoreReviewModeration_reviewId_fkey"
      FOREIGN KEY ("reviewId") REFERENCES "StoreReview"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "StoreReviewModeration_reviewId_idx" ON "StoreReviewModeration"("reviewId");
