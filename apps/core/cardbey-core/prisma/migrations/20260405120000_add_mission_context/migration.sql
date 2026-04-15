-- CreateTable
CREATE TABLE "MissionContext" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "contextJson" TEXT NOT NULL DEFAULT '{}',
    "snapshotsJson" TEXT NOT NULL DEFAULT '[]',
    "outcomeJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "MissionContext_missionId_key" ON "MissionContext"("missionId");

-- CreateIndex
CREATE INDEX "MissionContext_missionId_idx" ON "MissionContext"("missionId");
