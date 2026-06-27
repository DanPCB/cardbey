-- CreateTable
CREATE TABLE "frontend_errors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "filename" TEXT,
    "lineNumber" INTEGER,
    "columnNumber" INTEGER,
    "stack" TEXT,
    "url" TEXT,
    "status" INTEGER,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "frontend_errors_userId_idx" ON "frontend_errors"("userId");
CREATE INDEX "frontend_errors_sessionId_idx" ON "frontend_errors"("sessionId");
CREATE INDEX "frontend_errors_type_idx" ON "frontend_errors"("type");
CREATE INDEX "frontend_errors_timestamp_idx" ON "frontend_errors"("timestamp");
