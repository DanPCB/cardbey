-- CreateTable
CREATE TABLE "CampaignReport" (
    "id" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "missionId" TEXT,
    "summary" TEXT NOT NULL,
    "links" JSONB NOT NULL,
    "scheduleRecap" JSONB NOT NULL,
    "nextSteps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignReport_tenantKey_createdAt_idx" ON "CampaignReport"("tenantKey", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignReport_campaignId_idx" ON "CampaignReport"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignReport_missionId_idx" ON "CampaignReport"("missionId");

-- AddForeignKey
ALTER TABLE "CampaignReport" ADD CONSTRAINT "CampaignReport_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CampaignV2"("id") ON DELETE CASCADE ON UPDATE CASCADE;
