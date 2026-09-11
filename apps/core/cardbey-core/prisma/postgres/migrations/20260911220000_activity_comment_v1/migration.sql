-- Platform-wide Comment table for activity/content threads (Business Space + Global + future surfaces).

CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "activityId" TEXT,
    "storeId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'user',
    "text" TEXT NOT NULL,
    "parentCommentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Comment_contentType_contentId_createdAt_idx" ON "Comment"("contentType", "contentId", "createdAt");
CREATE INDEX "Comment_contentId_createdAt_idx" ON "Comment"("contentId", "createdAt");
CREATE INDEX "Comment_actorUserId_idx" ON "Comment"("actorUserId");
CREATE INDEX "Comment_activityId_idx" ON "Comment"("activityId");
CREATE INDEX "Comment_storeId_idx" ON "Comment"("storeId");
CREATE INDEX "Comment_status_idx" ON "Comment"("status");
