-- AlterTable
ALTER TABLE "observations" ADD COLUMN "executionState" TEXT NOT NULL DEFAULT 'executed';
ALTER TABLE "observations" ADD COLUMN "isRealExecution" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "observations_executionState_idx" ON "observations"("executionState");
CREATE INDEX "observations_isRealExecution_idx" ON "observations"("isRealExecution");
