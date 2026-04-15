-- Phase B: CampaignV2, CreativeCopy, CreativeAsset, CampaignScheduleItem, Offer, ChannelDeployment
CREATE TABLE "CampaignV2" (
    "id" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "missionId" TEXT,
    "storeId" TEXT,
    "draftStoreId" TEXT,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "degradedMode" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignV2_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CampaignV2_tenantKey_createdAt_idx" ON "CampaignV2"("tenantKey", "createdAt");
CREATE INDEX "CampaignV2_planId_idx" ON "CampaignV2"("planId");
CREATE INDEX "CampaignV2_missionId_idx" ON "CampaignV2"("missionId");

CREATE TABLE "CreativeCopy" (
    "id" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'caption',
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeCopy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CreativeCopy_campaignId_idx" ON "CreativeCopy"("campaignId");
CREATE INDEX "CreativeCopy_tenantKey_createdAt_idx" ON "CreativeCopy"("tenantKey", "createdAt");

CREATE TABLE "CreativeAsset" (
    "id" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'image_prompt',
    "prompt" TEXT,
    "mediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CreativeAsset_campaignId_idx" ON "CreativeAsset"("campaignId");

CREATE TABLE "CampaignScheduleItem" (
    "id" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'scheduled_posts',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "creativeCopyId" TEXT,
    "creativeAssetId" TEXT,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignScheduleItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CampaignScheduleItem_campaignId_idx" ON "CampaignScheduleItem"("campaignId");
CREATE INDEX "CampaignScheduleItem_tenantKey_scheduledAt_idx" ON "CampaignScheduleItem"("tenantKey", "scheduledAt");

CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'discount',
    "data" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Offer_campaignId_idx" ON "Offer"("campaignId");

CREATE TABLE "ChannelDeployment" (
    "id" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'scheduled_posts',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelDeployment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChannelDeployment_campaignId_idx" ON "ChannelDeployment"("campaignId");

ALTER TABLE "CampaignV2" ADD CONSTRAINT "CampaignV2_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CampaignPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreativeCopy" ADD CONSTRAINT "CreativeCopy_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CampaignV2"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreativeAsset" ADD CONSTRAINT "CreativeAsset_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CampaignV2"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignScheduleItem" ADD CONSTRAINT "CampaignScheduleItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CampaignV2"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CampaignV2"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelDeployment" ADD CONSTRAINT "ChannelDeployment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CampaignV2"("id") ON DELETE CASCADE ON UPDATE CASCADE;
