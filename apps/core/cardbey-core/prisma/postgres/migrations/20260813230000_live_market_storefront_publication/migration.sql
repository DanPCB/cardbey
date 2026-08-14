-- Live Market storefront publication status (editorial, independent of media LIVE)
ALTER TABLE "LiveMarketSession" ADD COLUMN "storefrontPublicationStatus" TEXT NOT NULL DEFAULT 'HIDDEN';
ALTER TABLE "LiveMarketSession" ADD COLUMN "storefrontPublishedAt" TIMESTAMP(3);
CREATE INDEX "LiveMarketSession_storeId_storefrontPublicationStatus_scheduledStartAt_idx" ON "LiveMarketSession"("storeId", "storefrontPublicationStatus", "scheduledStartAt");
