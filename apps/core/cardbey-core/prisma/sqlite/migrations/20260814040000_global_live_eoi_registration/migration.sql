-- Global Live pilot EOI registrations (marketing lead; not Live Market session RSVP)
CREATE TABLE "GlobalLiveEoiRegistration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pilotId" TEXT NOT NULL,
    "userId" TEXT,
    "storeId" TEXT,
    "name" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'Vietnam',
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "showcaseTypes" TEXT NOT NULL,
    "businessDescription" TEXT NOT NULL,
    "existingCardbeyBusiness" TEXT NOT NULL,
    "businessUrl" TEXT,
    "language" TEXT,
    "source" TEXT,
    "campaign" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "referrer" TEXT,
    "socialProvider" TEXT,
    "consentGranted" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "GlobalLiveEoiRegistration_pilotId_status_idx" ON "GlobalLiveEoiRegistration"("pilotId", "status");
CREATE INDEX "GlobalLiveEoiRegistration_pilotId_emailNormalized_idx" ON "GlobalLiveEoiRegistration"("pilotId", "emailNormalized");
CREATE INDEX "GlobalLiveEoiRegistration_status_createdAt_idx" ON "GlobalLiveEoiRegistration"("status", "createdAt");
CREATE INDEX "GlobalLiveEoiRegistration_createdAt_idx" ON "GlobalLiveEoiRegistration"("createdAt");
