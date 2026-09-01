-- Launchpad Market Graph / Capital Resource Network V1 (SQLite)
CREATE TABLE "market_graph_node" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "signalId" TEXT,
    "classification" TEXT,
    "primaryIntent" TEXT,
    "actorRole" TEXT NOT NULL,
    "marketSide" TEXT NOT NULL,
    "contextualRole" TEXT NOT NULL,
    "domain" TEXT,
    "resourceType" TEXT,
    "hasJson" TEXT NOT NULL,
    "wantsJson" TEXT NOT NULL,
    "constraintsJson" TEXT,
    "preferencesJson" TEXT,
    "geographyLabelsJson" TEXT NOT NULL,
    "evidenceConfidence" TEXT NOT NULL,
    "contextSummary" TEXT,
    "sourceType" TEXT,
    "sourceRef" TEXT,
    "provenanceJson" TEXT,
    "evidenceRefsJson" TEXT,
    "admissionState" TEXT NOT NULL DEFAULT 'admitted',
    "freshnessAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "admittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "nodePayloadJson" TEXT,
    "capitalProfileJson" TEXT
);

CREATE UNIQUE INDEX "market_graph_node_nodeId_key" ON "market_graph_node"("nodeId");
CREATE INDEX "market_graph_node_contextualRole_idx" ON "market_graph_node"("contextualRole");
CREATE INDEX "market_graph_node_domain_idx" ON "market_graph_node"("domain");
CREATE INDEX "market_graph_node_admissionState_idx" ON "market_graph_node"("admissionState");
CREATE INDEX "market_graph_node_freshnessAt_idx" ON "market_graph_node"("freshnessAt");
CREATE INDEX "market_graph_node_updatedAt_idx" ON "market_graph_node"("updatedAt");

CREATE TABLE "market_match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pairKey" TEXT NOT NULL,
    "nodeAId" TEXT NOT NULL,
    "nodeBId" TEXT NOT NULL,
    "reciprocalBand" TEXT NOT NULL,
    "matcherVersion" TEXT NOT NULL,
    "matchJson" TEXT NOT NULL,
    "capitalQualificationJson" TEXT,
    "reviewState" TEXT NOT NULL DEFAULT 'pending',
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invalidatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "market_match_nodeAId_fkey" FOREIGN KEY ("nodeAId") REFERENCES "market_graph_node" ("nodeId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "market_match_nodeBId_fkey" FOREIGN KEY ("nodeBId") REFERENCES "market_graph_node" ("nodeId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "market_match_pairKey_key" ON "market_match"("pairKey");
CREATE INDEX "market_match_reciprocalBand_idx" ON "market_match"("reciprocalBand");
CREATE INDEX "market_match_reviewState_idx" ON "market_match"("reviewState");
CREATE INDEX "market_match_isStale_idx" ON "market_match"("isStale");
CREATE INDEX "market_match_computedAt_idx" ON "market_match"("computedAt");

CREATE TABLE "capital_fundraising_mission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active_research',
    "companyLabel" TEXT,
    "graphNodeId" TEXT,
    "proposedTermsJson" TEXT,
    "evidenceJson" TEXT,
    "hypothesesJson" TEXT,
    "desiredOutcomesJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "capital_fundraising_mission_missionId_key" ON "capital_fundraising_mission"("missionId");
CREATE INDEX "capital_fundraising_mission_status_idx" ON "capital_fundraising_mission"("status");
