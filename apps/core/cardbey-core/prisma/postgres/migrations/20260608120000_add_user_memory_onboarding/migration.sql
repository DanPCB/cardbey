CREATE TABLE IF NOT EXISTS "UserMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastAction" TEXT,
    "lastActionAt" TIMESTAMP(3),
    "visitCount" INTEGER NOT NULL DEFAULT 1,
    "actionHistory" JSONB NOT NULL DEFAULT '[]',
    "abandonedTasks" JSONB NOT NULL DEFAULT '[]',
    "completedTasks" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserMemory_userId_key" ON "UserMemory"("userId");
CREATE INDEX IF NOT EXISTS "UserMemory_userId_idx" ON "UserMemory"("userId");

CREATE TABLE IF NOT EXISTS "OnboardingProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 5,
    "completedSteps" JSONB NOT NULL DEFAULT '[]',
    "lastStepAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OnboardingProgress_userId_key" ON "OnboardingProgress"("userId");
CREATE INDEX IF NOT EXISTS "OnboardingProgress_userId_idx" ON "OnboardingProgress"("userId");
