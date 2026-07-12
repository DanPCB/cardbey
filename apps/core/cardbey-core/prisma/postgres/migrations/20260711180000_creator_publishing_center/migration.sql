-- Creator Publishing Center — classification, decisions, events, appeals

ALTER TABLE "CreatorContent" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3);
ALTER TABLE "CreatorContent" ADD COLUMN IF NOT EXISTS "publishingDestinations" JSONB;
ALTER TABLE "CreatorContent" ADD COLUMN IF NOT EXISTS "creatorFeedback" JSONB;

CREATE TABLE "CreatorClassification" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "recommendation" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidenceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorClassification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CreatorClassification_contentId_idx" ON "CreatorClassification"("contentId");
CREATE INDEX "CreatorClassification_creatorId_idx" ON "CreatorClassification"("creatorId");
CREATE INDEX "CreatorClassification_createdAt_idx" ON "CreatorClassification"("createdAt");

ALTER TABLE "CreatorClassification" ADD CONSTRAINT "CreatorClassification_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "CreatorContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CreatorPublishingDecision" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "reviewerUserId" TEXT,
    "action" TEXT NOT NULL,
    "reasonCode" TEXT,
    "creatorFeedback" TEXT,
    "internalNote" TEXT,
    "destinationsJson" JSONB,
    "classificationId" TEXT,
    "aiRecommendation" TEXT,
    "disagreementType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorPublishingDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CreatorPublishingDecision_contentId_idx" ON "CreatorPublishingDecision"("contentId");
CREATE INDEX "CreatorPublishingDecision_reviewerUserId_idx" ON "CreatorPublishingDecision"("reviewerUserId");
CREATE INDEX "CreatorPublishingDecision_createdAt_idx" ON "CreatorPublishingDecision"("createdAt");

ALTER TABLE "CreatorPublishingDecision" ADD CONSTRAINT "CreatorPublishingDecision_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "CreatorContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CreatorPublishingEvent" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorPublishingEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CreatorPublishingEvent_contentId_idx" ON "CreatorPublishingEvent"("contentId");
CREATE INDEX "CreatorPublishingEvent_eventType_idx" ON "CreatorPublishingEvent"("eventType");
CREATE INDEX "CreatorPublishingEvent_createdAt_idx" ON "CreatorPublishingEvent"("createdAt");

ALTER TABLE "CreatorPublishingEvent" ADD CONSTRAINT "CreatorPublishingEvent_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "CreatorContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CreatorAppeal" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "CreatorAppeal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CreatorAppeal_contentId_idx" ON "CreatorAppeal"("contentId");
CREATE INDEX "CreatorAppeal_creatorId_idx" ON "CreatorAppeal"("creatorId");
CREATE INDEX "CreatorAppeal_status_idx" ON "CreatorAppeal"("status");

ALTER TABLE "CreatorAppeal" ADD CONSTRAINT "CreatorAppeal_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "CreatorContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "CreatorContent_scheduledAt_idx" ON "CreatorContent"("scheduledAt");
