CREATE TABLE IF NOT EXISTS "UserMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "lastAction" TEXT,
    "lastActionAt" DATETIME,
    "visitCount" INTEGER NOT NULL DEFAULT 1,
    "actionHistory" TEXT NOT NULL DEFAULT '[]',
    "abandonedTasks" TEXT NOT NULL DEFAULT '[]',
    "completedTasks" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserMemory_userId_key" ON "UserMemory"("userId");
CREATE INDEX IF NOT EXISTS "UserMemory_userId_idx" ON "UserMemory"("userId");

CREATE TABLE IF NOT EXISTS "OnboardingProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 5,
    "completedSteps" TEXT NOT NULL DEFAULT '[]',
    "lastStepAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "OnboardingProgress_userId_key" ON "OnboardingProgress"("userId");
CREATE INDEX IF NOT EXISTS "OnboardingProgress_userId_idx" ON "OnboardingProgress"("userId");
