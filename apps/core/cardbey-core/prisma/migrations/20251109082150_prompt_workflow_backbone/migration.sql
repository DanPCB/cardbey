/*
  Warnings:

  - You are about to alter the column `data` on the `Campaign` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `actions` on the `Workflow` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "productId" TEXT,
    "data" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "workflowId" TEXT,
    CONSTRAINT "Campaign_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Campaign" ("createdAt", "data", "id", "productId", "status", "title", "updatedAt", "workflowId") SELECT "createdAt", "data", "id", "productId", "status", "title", "updatedAt", "workflowId" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
CREATE TABLE "new_Workflow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "trigger" TEXT NOT NULL DEFAULT 'MANUAL',
    "actions" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Workflow" ("actions", "createdAt", "id", "name", "prompt", "status", "trigger", "updatedAt") SELECT "actions", "createdAt", "id", "name", "prompt", "status", "trigger", "updatedAt" FROM "Workflow";
DROP TABLE "Workflow";
ALTER TABLE "new_Workflow" RENAME TO "Workflow";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
