/**
 * Create URI Phase 2 reuse tables without full prisma db push.
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
  `CREATE TABLE IF NOT EXISTS "ResourceSearchSession" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "userId" TEXT,
    "utterance" TEXT,
    "intentJson" TEXT NOT NULL,
    "searchPlanJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "jobId" TEXT,
    "consumer" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS "ResourceSearchSession_userId_idx" ON "ResourceSearchSession"("userId")`,
  `CREATE TABLE IF NOT EXISTS "ResourceCandidateSnapshot" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "sessionId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "fingerprint" TEXT,
    "payloadJson" TEXT NOT NULL,
    "explanationJson" TEXT,
    "rightsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("sessionId") REFERENCES "ResourceSearchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "ResourceCandidateSnapshot_sessionId_idx" ON "ResourceCandidateSnapshot"("sessionId")`,
  `CREATE TABLE IF NOT EXISTS "ResourceSelection" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "sessionId" TEXT NOT NULL,
    "candidateSnapshotId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SELECTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("sessionId") REFERENCES "ResourceSearchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "ReuseIntent" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "selectionId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "intendedPurpose" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "preferredCustodyMode" TEXT,
    "payloadJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("selectionId") REFERENCES "ResourceSelection"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "ReuseDecision" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "reuseIntentId" TEXT NOT NULL,
    "reusePlanJson" TEXT NOT NULL,
    "custodyMode" TEXT NOT NULL,
    "rightsDecisionJson" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "userConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
    "confirmedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("reuseIntentId") REFERENCES "ReuseIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "ResourceAttributionSnapshot" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "externalResourceUseId" TEXT,
    "reuseDecisionId" TEXT,
    "text" TEXT NOT NULL,
    "creator" TEXT,
    "provider" TEXT,
    "license" TEXT,
    "sourceUrl" TEXT,
    "payloadJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "ResourceRetrievalJob" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "reuseDecisionId" TEXT NOT NULL,
    "custodyMode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "errorCode" TEXT,
    "resultJson" TEXT,
    "binaryStored" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("reuseDecisionId") REFERENCES "ReuseDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "ExternalResourceUse" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "selectionId" TEXT,
    "reuseIntentId" TEXT,
    "reuseDecisionId" TEXT,
    "resourceId" TEXT NOT NULL,
    "intendedPurpose" TEXT,
    "sourceMetadataJson" TEXT NOT NULL,
    "rightsDecisionJson" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "attributionSnapshotId" TEXT,
    "custodyMode" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "playlistId" TEXT,
    "suitcaseItemId" TEXT,
    "signageAssetId" TEXT,
    "retrievalJobId" TEXT,
    "retrievalResultJson" TEXT,
    "binaryStored" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS "ExternalResourceUse_userId_idx" ON "ExternalResourceUse"("userId")`,
  `CREATE INDEX IF NOT EXISTS "ExternalResourceUse_playlistId_idx" ON "ExternalResourceUse"("playlistId")`,
];

export async function ensureUriReuseTables() {
  await ensurePrismaConnection();
  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }
  return { ok: true };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await ensureUriReuseTables();
  console.log('URI reuse tables ensured');
  await prisma.$disconnect();
}
