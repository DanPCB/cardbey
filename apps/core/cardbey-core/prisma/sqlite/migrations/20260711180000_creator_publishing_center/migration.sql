-- Creator Publishing Center — classification, decisions, events, appeals

ALTER TABLE "CreatorContent" ADD COLUMN "scheduledAt" DATETIME;
ALTER TABLE "CreatorContent" ADD COLUMN "publishingDestinations" TEXT;
ALTER TABLE "CreatorContent" ADD COLUMN "creatorFeedback" TEXT;

CREATE TABLE "CreatorClassification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "evidenceJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorClassification_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "CreatorContent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CreatorClassification_contentId_idx" ON "CreatorClassification"("contentId");
CREATE INDEX "CreatorClassification_creatorId_idx" ON "CreatorClassification"("creatorId");
CREATE INDEX "CreatorClassification_createdAt_idx" ON "CreatorClassification"("createdAt");

CREATE TABLE "CreatorPublishingDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "reviewerUserId" TEXT,
    "action" TEXT NOT NULL,
    "reasonCode" TEXT,
    "creatorFeedback" TEXT,
    "internalNote" TEXT,
    "destinationsJson" TEXT,
    "classificationId" TEXT,
    "aiRecommendation" TEXT,
    "disagreementType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorPublishingDecision_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "CreatorContent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CreatorPublishingDecision_contentId_idx" ON "CreatorPublishingDecision"("contentId");
CREATE INDEX "CreatorPublishingDecision_reviewerUserId_idx" ON "CreatorPublishingDecision"("reviewerUserId");
CREATE INDEX "CreatorPublishingDecision_createdAt_idx" ON "CreatorPublishingDecision"("createdAt");

CREATE TABLE "CreatorPublishingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorPublishingEvent_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "CreatorContent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CreatorPublishingEvent_contentId_idx" ON "CreatorPublishingEvent"("contentId");
CREATE INDEX "CreatorPublishingEvent_eventType_idx" ON "CreatorPublishingEvent"("eventType");
CREATE INDEX "CreatorPublishingEvent_createdAt_idx" ON "CreatorPublishingEvent"("createdAt");

CREATE TABLE "CreatorAppeal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolutionNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "CreatorAppeal_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "CreatorContent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CreatorAppeal_contentId_idx" ON "CreatorAppeal"("contentId");
CREATE INDEX "CreatorAppeal_creatorId_idx" ON "CreatorAppeal"("creatorId");
CREATE INDEX "CreatorAppeal_status_idx" ON "CreatorAppeal"("status");

CREATE INDEX "CreatorContent_scheduledAt_idx" ON "CreatorContent"("scheduledAt");
