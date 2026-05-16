-- AlterTable
ALTER TABLE "MiJob" ADD COLUMN "progressPct" INTEGER DEFAULT 0;
ALTER TABLE "MiJob" ADD COLUMN "lastHeartbeatAt" DATETIME;
ALTER TABLE "MiJob" ADD COLUMN "lastError" TEXT;


















