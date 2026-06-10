-- Phase 4: Business Memory & Outcome Tracking

CREATE TABLE "business_observation_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "healthScore" INTEGER NOT NULL,
    "observationsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "business_observation_store_snapshot" ON "business_observation_events"("storeId", "snapshotId");
CREATE INDEX "business_observation_events_storeId_ownerId_idx" ON "business_observation_events"("storeId", "ownerId");
CREATE INDEX "business_observation_events_createdAt_idx" ON "business_observation_events"("createdAt");

CREATE TABLE "business_opportunity_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "observationEventId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "recommendedActionJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_opportunity_events_observationEventId_fkey" FOREIGN KEY ("observationEventId") REFERENCES "business_observation_events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "business_opportunity_store_opp_snapshot" ON "business_opportunity_events"("storeId", "opportunityId", "snapshotId");
CREATE INDEX "business_opportunity_events_observationEventId_idx" ON "business_opportunity_events"("observationEventId");
CREATE INDEX "business_opportunity_events_storeId_ownerId_idx" ON "business_opportunity_events"("storeId", "ownerId");
CREATE INDEX "business_opportunity_events_createdAt_idx" ON "business_opportunity_events"("createdAt");

CREATE TABLE "business_decision_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "opportunityEventId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_decision_events_opportunityEventId_fkey" FOREIGN KEY ("opportunityEventId") REFERENCES "business_opportunity_events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "business_decision_events_opportunityEventId_idx" ON "business_decision_events"("opportunityEventId");
CREATE INDEX "business_decision_events_storeId_ownerId_decision_idx" ON "business_decision_events"("storeId", "ownerId", "decision");
CREATE INDEX "business_decision_events_createdAt_idx" ON "business_decision_events"("createdAt");

CREATE TABLE "business_action_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "opportunityEventId" TEXT NOT NULL,
    "decisionEventId" TEXT,
    "missionId" TEXT,
    "actionType" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "business_action_events_opportunityEventId_fkey" FOREIGN KEY ("opportunityEventId") REFERENCES "business_opportunity_events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "business_action_events_missionId_key" ON "business_action_events"("missionId");
CREATE INDEX "business_action_events_opportunityEventId_idx" ON "business_action_events"("opportunityEventId");
CREATE INDEX "business_action_events_storeId_ownerId_idx" ON "business_action_events"("storeId", "ownerId");
CREATE INDEX "business_action_events_status_idx" ON "business_action_events"("status");
CREATE INDEX "business_action_events_createdAt_idx" ON "business_action_events"("createdAt");

CREATE TABLE "business_outcome_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "opportunityEventId" TEXT NOT NULL,
    "actionEventId" TEXT NOT NULL,
    "missionId" TEXT,
    "outcomeType" TEXT NOT NULL,
    "outcomeJson" TEXT NOT NULL,
    "measuredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_outcome_events_opportunityEventId_fkey" FOREIGN KEY ("opportunityEventId") REFERENCES "business_opportunity_events" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "business_outcome_events_actionEventId_fkey" FOREIGN KEY ("actionEventId") REFERENCES "business_action_events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "business_outcome_events_missionId_key" ON "business_outcome_events"("missionId");
CREATE INDEX "business_outcome_events_opportunityEventId_idx" ON "business_outcome_events"("opportunityEventId");
CREATE INDEX "business_outcome_events_actionEventId_idx" ON "business_outcome_events"("actionEventId");
CREATE INDEX "business_outcome_events_storeId_ownerId_idx" ON "business_outcome_events"("storeId", "ownerId");
CREATE INDEX "business_outcome_events_outcomeType_idx" ON "business_outcome_events"("outcomeType");
CREATE INDEX "business_outcome_events_createdAt_idx" ON "business_outcome_events"("createdAt");
