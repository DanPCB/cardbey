-- Live Market participant registration (audience RSVP without LIVE or streaming)
CREATE TABLE "LiveMarketParticipantRegistration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferredLanguage" TEXT NOT NULL,
    "questionForHost" TEXT,
    "interestSubjectId" TEXT,
    "interestSubjectType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "registeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LiveMarketParticipantRegistration_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveMarketSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LiveMarketParticipantRegistration_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LiveMarketParticipantRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LiveMarketParticipantRegistration_sessionId_userId_key" ON "LiveMarketParticipantRegistration"("sessionId", "userId");
CREATE INDEX "LiveMarketParticipantRegistration_storeId_status_idx" ON "LiveMarketParticipantRegistration"("storeId", "status");
CREATE INDEX "LiveMarketParticipantRegistration_userId_status_registeredAt_idx" ON "LiveMarketParticipantRegistration"("userId", "status", "registeredAt");
CREATE INDEX "LiveMarketParticipantRegistration_sessionId_status_idx" ON "LiveMarketParticipantRegistration"("sessionId", "status");
