/**
 * Create Capability Engine tables without full prisma db push (avoids unrelated casts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma, ensurePrismaConnection } from '../src/lib/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const statements = [
  `CREATE TABLE IF NOT EXISTS "Capability" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "ownerType" TEXT NOT NULL DEFAULT 'platform',
    "ownerId" TEXT NOT NULL,
    "creatorId" TEXT,
    "slug" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "capabilityType" TEXT NOT NULL,
    "industry" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "currentVersionId" TEXT,
    "defaultLicenceCode" TEXT,
    "iconAssetId" TEXT,
    "coverAssetId" TEXT,
    "previewAssetIds" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    "archivedAt" DATETIME
  )`,
  `CREATE INDEX IF NOT EXISTS "Capability_status_idx" ON "Capability"("status")`,
  `CREATE INDEX IF NOT EXISTS "Capability_capabilityType_idx" ON "Capability"("capabilityType")`,
  `CREATE TABLE IF NOT EXISTS "CapabilityVersion" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "versionLabel" TEXT,
    "inputSchema" TEXT,
    "outputSchema" TEXT,
    "executionDefinition" TEXT,
    "dependencyDefinition" TEXT,
    "compatibilityDefinition" TEXT,
    "changelog" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    "publishedAt" DATETIME,
    UNIQUE("capabilityId", "versionNumber"),
    FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "CapabilityComponent" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "capabilityVersionId" TEXT NOT NULL,
    "componentType" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "configuration" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    FOREIGN KEY ("capabilityVersionId") REFERENCES "CapabilityVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "CapabilityInstallation" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "capabilityVersionId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "installedByUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "inputSnapshot" TEXT,
    "executionPlanSnapshot" TEXT,
    "resultSnapshot" TEXT,
    "beforeSnapshot" TEXT,
    "failureCode" TEXT,
    "installedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rolledBackAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("capabilityVersionId") REFERENCES "CapabilityVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "CapabilityInstallation_target_idx" ON "CapabilityInstallation"("targetType", "targetId")`,
  `CREATE TABLE IF NOT EXISTS "CapabilityExecutionEvent" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "installationId" TEXT NOT NULL,
    "stepId" TEXT,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "beforeReference" TEXT,
    "afterReference" TEXT,
    "errorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("installationId") REFERENCES "CapabilityInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
];

export async function ensureCapabilityTables() {
  await ensurePrismaConnection();
  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }
  return { ok: true };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await ensureCapabilityTables();
  console.log('Capability tables ensured');
  await prisma.$disconnect();
}
