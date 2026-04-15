-- CreateTable
CREATE TABLE "TrendProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "season" TEXT,
    "domain" TEXT,
    "goal" TEXT,
    "source" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "TrendProfile_slug_key" ON "TrendProfile"("slug");

-- CreateIndex
CREATE INDEX "TrendProfile_slug_idx" ON "TrendProfile"("slug");

-- CreateIndex
CREATE INDEX "TrendProfile_isActive_goal_idx" ON "TrendProfile"("isActive", "goal");

-- CreateIndex
CREATE INDEX "TrendProfile_season_idx" ON "TrendProfile"("season");
