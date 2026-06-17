-- CreateTable
CREATE TABLE "user_signal_preferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "enabledSignals" JSONB NOT NULL DEFAULT '[]',
    "disabledSignals" JSONB NOT NULL DEFAULT '[]',
    "customThresholds" JSONB NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "user_signal_preferences_userId_key" ON "user_signal_preferences"("userId");
CREATE INDEX "user_signal_preferences_userId_idx" ON "user_signal_preferences"("userId");
