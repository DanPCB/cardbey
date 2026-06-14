/**
 * Idempotent SQLite DDL for local dev schema drift repair.
 */

export const PRODUCT_COLUMN_REPAIRS = [
  { table: 'Product', name: 'isFeatured', ddl: 'ALTER TABLE "Product" ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false' },
  { table: 'Product', name: 'featuredAt', ddl: 'ALTER TABLE "Product" ADD COLUMN "featuredAt" DATETIME' },
];

export const PUBLISHED_ARTIFACT_PROJECTION_COLUMN_REPAIRS = [
  { table: 'PublishedArtifactProjection', name: 'heroVideoUrl', ddl: 'ALTER TABLE "PublishedArtifactProjection" ADD COLUMN "heroVideoUrl" TEXT' },
  { table: 'PublishedArtifactProjection', name: 'heroMediaType', ddl: 'ALTER TABLE "PublishedArtifactProjection" ADD COLUMN "heroMediaType" TEXT' },
];

export const PRODUCT_INDEX_DDL = [
  'CREATE INDEX IF NOT EXISTS "Product_businessId_isFeatured_idx" ON "Product"("businessId", "isFeatured")',
];

export const LOYALTY_PROGRAM_STAMP_DDL = `CREATE TABLE IF NOT EXISTS "LoyaltyProgramStamp" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "rewarded" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoyaltyProgramStamp_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LoyaltyProgram" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`;

export const LOYALTY_PROGRAM_STAMP_INDEX_DDL = [
  'CREATE INDEX IF NOT EXISTS "LoyaltyProgramStamp_tenantId_idx" ON "LoyaltyProgramStamp"("tenantId")',
  'CREATE INDEX IF NOT EXISTS "LoyaltyProgramStamp_storeId_idx" ON "LoyaltyProgramStamp"("storeId")',
  'CREATE INDEX IF NOT EXISTS "LoyaltyProgramStamp_programId_idx" ON "LoyaltyProgramStamp"("programId")',
  'CREATE INDEX IF NOT EXISTS "LoyaltyProgramStamp_customerId_idx" ON "LoyaltyProgramStamp"("customerId")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyProgramStamp_tenantId_storeId_programId_customerId_key" ON "LoyaltyProgramStamp"("tenantId", "storeId", "programId", "customerId")',
];

export const SMART_DOCUMENT_TABLES = [
  {
    name: 'SmartDocument',
    sql: `CREATE TABLE IF NOT EXISTS "SmartDocument" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "businessId" TEXT,
      "docType" TEXT NOT NULL,
      "subtype" TEXT,
      "title" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'active',
      "phase" TEXT NOT NULL DEFAULT 'pre',
      "designJson" TEXT,
      "renderedUrl" TEXT,
      "printUrl" TEXT,
      "qrCodeUrl" TEXT,
      "liveUrl" TEXT,
      "sizeW" REAL,
      "sizeH" REAL,
      "sizeUnit" TEXT DEFAULT 'mm',
      "sizeDpi" INTEGER DEFAULT 300,
      "agentPersonality" TEXT,
      "knowledgeBase" TEXT,
      "capabilities" TEXT NOT NULL DEFAULT '[]',
      "autoApprove" BOOLEAN NOT NULL DEFAULT true,
      "phaseConfig" TEXT,
      "expiresAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "SmartDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "SmartDocument_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )`,
  },
  {
    name: 'DocVisitor',
    sql: `CREATE TABLE IF NOT EXISTS "DocVisitor" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "docId" TEXT NOT NULL,
      "sessionToken" TEXT NOT NULL,
      "phone" TEXT,
      "email" TEXT,
      "name" TEXT,
      "platformVisitorId" TEXT,
      "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastSeenAt" DATETIME NOT NULL,
      CONSTRAINT "DocVisitor_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SmartDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  },
  {
    name: 'DocConversation',
    sql: `CREATE TABLE IF NOT EXISTS "DocConversation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "docId" TEXT NOT NULL,
      "visitorId" TEXT NOT NULL,
      "channel" TEXT NOT NULL DEFAULT 'web',
      "messages" TEXT NOT NULL DEFAULT '[]',
      "outcome" TEXT,
      "intent" TEXT,
      "sentiment" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "DocConversation_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SmartDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "DocConversation_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "DocVisitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  },
  {
    name: 'DocCheckIn',
    sql: `CREATE TABLE IF NOT EXISTS "DocCheckIn" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "docId" TEXT NOT NULL,
      "visitorId" TEXT NOT NULL,
      "checkedInAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "note" TEXT,
      CONSTRAINT "DocCheckIn_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SmartDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "DocCheckIn_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "DocVisitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  },
  {
    name: 'DocSignature',
    sql: `CREATE TABLE IF NOT EXISTS "DocSignature" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "docId" TEXT NOT NULL,
      "visitorId" TEXT NOT NULL,
      "signedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "signatureUrl" TEXT,
      "ipAddress" TEXT,
      CONSTRAINT "DocSignature_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SmartDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "DocSignature_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "DocVisitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  },
  {
    name: 'DocScheduledMessage',
    sql: `CREATE TABLE IF NOT EXISTS "DocScheduledMessage" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "docId" TEXT NOT NULL,
      "sendAt" DATETIME NOT NULL,
      "channel" TEXT NOT NULL DEFAULT 'web',
      "payload" TEXT,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "attempts" INTEGER NOT NULL DEFAULT 0,
      "sentAt" DATETIME,
      "error" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "DocScheduledMessage_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SmartDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  },
  {
    name: 'LoyaltyStamp',
    sql: `CREATE TABLE IF NOT EXISTS "LoyaltyStamp" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "docId" TEXT NOT NULL,
      "visitorId" TEXT NOT NULL,
      "stampedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "redeemedAt" DATETIME,
      CONSTRAINT "LoyaltyStamp_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SmartDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "LoyaltyStamp_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "DocVisitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  },
  {
    name: 'DocumentPromoRedemption',
    sql: `CREATE TABLE IF NOT EXISTS "DocumentPromoRedemption" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "docId" TEXT NOT NULL,
      "visitorId" TEXT NOT NULL,
      "redeemedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "discountApplied" TEXT,
      CONSTRAINT "DocumentPromoRedemption_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SmartDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "DocumentPromoRedemption_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "DocVisitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  },
  {
    name: 'EventRsvp',
    sql: `CREATE TABLE IF NOT EXISTS "EventRsvp" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "docId" TEXT NOT NULL,
      "visitorId" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "rsvpAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "EventRsvp_docId_fkey" FOREIGN KEY ("docId") REFERENCES "SmartDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "EventRsvp_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "DocVisitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  },
];

export const SMART_DOCUMENT_INDEX_DDL = [
  'CREATE INDEX IF NOT EXISTS "SmartDocument_userId_createdAt_idx" ON "SmartDocument"("userId", "createdAt")',
  'CREATE INDEX IF NOT EXISTS "SmartDocument_businessId_createdAt_idx" ON "SmartDocument"("businessId", "createdAt")',
  'CREATE INDEX IF NOT EXISTS "SmartDocument_docType_status_idx" ON "SmartDocument"("docType", "status")',
  'CREATE INDEX IF NOT EXISTS "SmartDocument_phase_status_idx" ON "SmartDocument"("phase", "status")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "DocVisitor_sessionToken_key" ON "DocVisitor"("sessionToken")',
  'CREATE INDEX IF NOT EXISTS "DocVisitor_docId_lastSeenAt_idx" ON "DocVisitor"("docId", "lastSeenAt")',
  'CREATE INDEX IF NOT EXISTS "DocVisitor_platformVisitorId_idx" ON "DocVisitor"("platformVisitorId")',
  'CREATE INDEX IF NOT EXISTS "DocConversation_docId_updatedAt_idx" ON "DocConversation"("docId", "updatedAt")',
  'CREATE INDEX IF NOT EXISTS "DocConversation_visitorId_updatedAt_idx" ON "DocConversation"("visitorId", "updatedAt")',
  'CREATE INDEX IF NOT EXISTS "DocConversation_channel_createdAt_idx" ON "DocConversation"("channel", "createdAt")',
  'CREATE INDEX IF NOT EXISTS "DocCheckIn_docId_checkedInAt_idx" ON "DocCheckIn"("docId", "checkedInAt")',
  'CREATE INDEX IF NOT EXISTS "DocCheckIn_visitorId_checkedInAt_idx" ON "DocCheckIn"("visitorId", "checkedInAt")',
  'CREATE INDEX IF NOT EXISTS "DocSignature_docId_signedAt_idx" ON "DocSignature"("docId", "signedAt")',
  'CREATE INDEX IF NOT EXISTS "DocSignature_visitorId_signedAt_idx" ON "DocSignature"("visitorId", "signedAt")',
  'CREATE INDEX IF NOT EXISTS "DocScheduledMessage_docId_sendAt_idx" ON "DocScheduledMessage"("docId", "sendAt")',
  'CREATE INDEX IF NOT EXISTS "DocScheduledMessage_status_sendAt_idx" ON "DocScheduledMessage"("status", "sendAt")',
  'CREATE INDEX IF NOT EXISTS "LoyaltyStamp_docId_stampedAt_idx" ON "LoyaltyStamp"("docId", "stampedAt")',
  'CREATE INDEX IF NOT EXISTS "LoyaltyStamp_visitorId_stampedAt_idx" ON "LoyaltyStamp"("visitorId", "stampedAt")',
  'CREATE INDEX IF NOT EXISTS "DocumentPromoRedemption_docId_redeemedAt_idx" ON "DocumentPromoRedemption"("docId", "redeemedAt")',
  'CREATE INDEX IF NOT EXISTS "DocumentPromoRedemption_visitorId_redeemedAt_idx" ON "DocumentPromoRedemption"("visitorId", "redeemedAt")',
  'CREATE INDEX IF NOT EXISTS "EventRsvp_docId_rsvpAt_idx" ON "EventRsvp"("docId", "rsvpAt")',
  'CREATE INDEX IF NOT EXISTS "EventRsvp_visitorId_rsvpAt_idx" ON "EventRsvp"("visitorId", "rsvpAt")',
];

/**
 * Legacy store loyalty used table name LoyaltyStamp; Prisma now expects LoyaltyProgramStamp.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {(name: string) => boolean} tableExists
 * @param {(table: string) => Set<string>} tableColumns
 */
export function repairLoyaltyProgramStampTable(db, tableExists, tableColumns) {
  if (tableExists('LoyaltyProgramStamp')) {
    return null;
  }
  const legacyCols = tableColumns('LoyaltyStamp');
  if (tableExists('LoyaltyStamp') && legacyCols.has('programId') && !legacyCols.has('docId')) {
    db.exec('ALTER TABLE "LoyaltyStamp" RENAME TO "LoyaltyProgramStamp"');
    return 'LoyaltyStamp->LoyaltyProgramStamp';
  }
  db.exec(LOYALTY_PROGRAM_STAMP_DDL);
  return 'LoyaltyProgramStamp.created';
}

/**
 * Create doc-scoped LoyaltyStamp only when legacy store table was renamed away.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {(name: string) => boolean} tableExists
 * @param {(table: string) => Set<string>} tableColumns
 */
export function ensureDocumentLoyaltyStampTable(db, tableExists, tableColumns) {
  if (!tableExists('LoyaltyStamp')) {
    const docTable = SMART_DOCUMENT_TABLES.find((t) => t.name === 'LoyaltyStamp');
    if (docTable) db.exec(docTable.sql);
    return 'LoyaltyStamp.doc.created';
  }
  const cols = tableColumns('LoyaltyStamp');
  if (cols.has('docId') && cols.has('visitorId')) {
    return null;
  }
  return null;
}
