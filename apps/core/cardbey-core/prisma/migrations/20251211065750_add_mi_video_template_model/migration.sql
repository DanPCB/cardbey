-- CreateTable
CREATE TABLE "MiVideoTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "occasionType" TEXT NOT NULL,
    "orientation" TEXT NOT NULL,
    "backgroundUrl" TEXT NOT NULL,
    "posterUrl" TEXT NOT NULL,
    "textZonesJson" TEXT NOT NULL,
    "textStylesJson" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "MiVideoTemplate_key_key" ON "MiVideoTemplate"("key");

-- CreateIndex
CREATE INDEX "MiVideoTemplate_occasionType_idx" ON "MiVideoTemplate"("occasionType");

-- CreateIndex
CREATE INDEX "MiVideoTemplate_orientation_idx" ON "MiVideoTemplate"("orientation");

-- CreateIndex
CREATE INDEX "MiVideoTemplate_isActive_idx" ON "MiVideoTemplate"("isActive");
