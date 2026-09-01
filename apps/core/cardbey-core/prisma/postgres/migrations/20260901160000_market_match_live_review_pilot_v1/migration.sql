-- Live Match Review Pilot V1 — operator market-truth layer (does not alter matchJson)

CREATE TABLE "market_match_review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pairKey" TEXT NOT NULL,
    "nodeAId" TEXT NOT NULL,
    "nodeBId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "reviewerId" TEXT,
    "semanticTruthJson" JSONB NOT NULL,
    "structuralTruthJson" JSONB NOT NULL,
    "marketTruthJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "market_match_review_pairKey_idx" ON "market_match_review"("pairKey");
CREATE INDEX "market_match_review_decision_idx" ON "market_match_review"("decision");
CREATE INDEX "market_match_review_createdAt_idx" ON "market_match_review"("createdAt");

CREATE TABLE "market_match_connection_event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pairKey" TEXT NOT NULL,
    "reviewId" TEXT,
    "eventType" TEXT NOT NULL,
    "stageState" TEXT NOT NULL DEFAULT 'RECORDED',
    "actorId" TEXT,
    "payloadJson" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "market_match_connection_event_pairKey_idx" ON "market_match_connection_event"("pairKey");
CREATE INDEX "market_match_connection_event_eventType_idx" ON "market_match_connection_event"("eventType");
CREATE INDEX "market_match_connection_event_occurredAt_idx" ON "market_match_connection_event"("occurredAt");
