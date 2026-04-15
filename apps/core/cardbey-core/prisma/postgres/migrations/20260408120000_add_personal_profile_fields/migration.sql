-- Personal profile Phase 1: nullable fields + optional 1:1 link to Business (store) for presence QR.
ALTER TABLE "User" ADD COLUMN "profilePhoto" TEXT,
ADD COLUMN "bio" TEXT,
ADD COLUMN "qrCodeUrl" TEXT,
ADD COLUMN "personalPresenceStoreId" TEXT;

CREATE UNIQUE INDEX "User_personalPresenceStoreId_key" ON "User"("personalPresenceStoreId");

ALTER TABLE "User" ADD CONSTRAINT "User_personalPresenceStoreId_fkey" FOREIGN KEY ("personalPresenceStoreId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
