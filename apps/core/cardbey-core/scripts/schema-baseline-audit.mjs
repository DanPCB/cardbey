#!/usr/bin/env node
/**
 * Full baseline audit — writes docs/db/BASELINE_AUDIT_<timestamp>.json and BASELINE_AUDIT_LATEST.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  buildSchemaFingerprint,
  classifyMigrationHealth,
  getAppliedMigrations,
  inspectCreativeAssetDrift,
  listMigrationFolderNames,
  readSchemaPrismaHash,
  SCHEMA_SQLITE_PATH,
  MIGRATIONS_DIR,
} from '../src/lib/schemaFingerprint.js';
import {
  CANONICAL_DEV_DB,
  CANONICAL_TEST_DB,
  PACKAGE_ROOT,
  inspectSqliteDatabase,
  resolveSqliteDatabasePath,
} from '../src/lib/sqliteDbPath.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsDb = path.join(PACKAGE_ROOT, 'docs', 'db');
fs.mkdirSync(docsDb, { recursive: true });

dotenv.config({ path: path.join(PACKAGE_ROOT, '.env'), override: true });
if (!process.env.DATABASE_URL?.startsWith('file:')) {
  process.env.DATABASE_URL = 'file:../dev.db';
}

const resolved = resolveSqliteDatabasePath();
const fp = buildSchemaFingerprint();
const applied = getAppliedMigrations(resolved);
const folders = listMigrationFolderNames();
const inspect = resolved ? inspectSqliteDatabase(resolved) : null;
const creative = resolved ? inspectCreativeAssetDrift(resolved) : null;

const health = classifyMigrationHealth(fp);
let status = 'clean';
if (fp.ghostDbFiles?.length) status = 'unsafe';
else if (!fp.requiredColumnsOk) status = 'unsafe';
else if (health === 'unsafe') status = 'unsafe';
else if (health === 'accepted') status = 'accepted';
else if (creative?.driftBlocksDbPush) status = 'drifted';

const audit = {
  generatedAt: new Date().toISOString(),
  status,
  statusReason:
    status === 'clean'
      ? 'Canonical DB, no ghost files, migration drift within acceptable repair range.'
      : status === 'accepted'
        ? 'Migration folder drift accepted for local dev (baseline-acceptance.local.json matches fingerprint).'
        : status === 'drifted'
          ? 'CreativeAsset/db push drift may apply.'
          : status === 'unsafe'
            ? 'Migration drift without valid baseline acceptance, or ghost DB / missing columns.'
            : 'Ghost DB files present or required columns missing on canonical dev.db.',
  database: {
    DATABASE_URL: process.env.DATABASE_URL,
    resolvedDbPath: resolved,
    canonicalDevDb: CANONICAL_DEV_DB,
    canonicalTestDb: CANONICAL_TEST_DB,
    isCanonical: resolved ? path.resolve(resolved) === path.resolve(CANONICAL_DEV_DB) : false,
    provider: fp.provider,
    prismaClientVersion: fp.prismaClientVersion,
    prismaVersion: fp.prismaVersion,
  },
  schema: {
    schemaPath: SCHEMA_SQLITE_PATH,
    schemaPrismaHash: readSchemaPrismaHash(),
    migrationFolderCount: folders.length,
    migrationFoldersHash: fp.migrationFoldersHash,
    latestMigrationFolders: folders.slice(-10),
  },
  migrations: {
    appliedRowCount: applied.migrationCount,
    latestApplied: applied.latestApplied,
    missingApplied: fp.migrationDrift?.missingApplied ?? [],
    unappliedInDb: fp.migrationDrift?.unappliedInDb ?? [],
    migrationHealth: health,
  },
  tables: {
    tableCount: fp.tableCount,
    tableColumnHash: fp.tableColumnHash,
    draftStore: {
      columns: inspect?.draftStoreColumns ?? [],
      hasPublishSnapshot: inspect?.draftStoreHasPublishSnapshot,
      hasPublishSnapshotVersion: inspect?.draftStoreHasPublishSnapshotVersion,
    },
    creativeAsset: creative,
  },
  ghostDbFiles: fp.ghostDbFiles,
  fingerprint: {
    requiredColumnsOk: fp.requiredColumnsOk,
    requiredColumnStatus: fp.requiredColumnStatus,
    committed: fp.committedFingerprint,
  },
};

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const jsonPath = path.join(docsDb, `BASELINE_AUDIT_${ts}.json`);
const latestJson = path.join(docsDb, 'BASELINE_AUDIT_LATEST.json');
const latestMd = path.join(docsDb, 'BASELINE_AUDIT_LATEST.md');

fs.writeFileSync(jsonPath, JSON.stringify(audit, null, 2));
fs.writeFileSync(latestJson, JSON.stringify(audit, null, 2));

const md = `# Baseline audit (latest)

Generated: ${audit.generatedAt}

## Status: **${status.toUpperCase()}**

${audit.statusReason}

## Database

| Field | Value |
|-------|-------|
| DATABASE_URL | \`${audit.database.DATABASE_URL}\` |
| Resolved path | \`${audit.database.resolvedDbPath}\` |
| Canonical | ${audit.database.isCanonical ? 'yes' : '**NO**'} |
| Provider | ${audit.database.provider} |
| Prisma Client | ${audit.database.prismaClientVersion} |

## Schema

| Field | Value |
|-------|-------|
| schema.prisma hash | \`${audit.schema.schemaPrismaHash}\` |
| Migration folders | ${audit.schema.migrationFolderCount} |
| Applied rows in DB | ${audit.migrations.appliedRowCount} |

## Migration drift

- **Health:** ${audit.migrations.migrationHealth}
- **Missing applied (folders not in DB):** ${audit.migrations.missingApplied.length}
- **Orphan in DB (not in folders):** ${audit.migrations.unappliedInDb.length}

${audit.migrations.missingApplied.length ? `\n### Missing applied (sample)\n\n${audit.migrations.missingApplied.slice(0, 15).map((m) => `- ${m}`).join('\n')}\n` : ''}

${audit.migrations.unappliedInDb.length ? `\n### Orphan applied names\n\n${audit.migrations.unappliedInDb.map((m) => `- ${m}`).join('\n')}\n` : ''}

## DraftStore

- publishSnapshot: ${inspect?.draftStoreHasPublishSnapshot ? 'yes' : '**no**'}
- publishSnapshotVersion: ${inspect?.draftStoreHasPublishSnapshotVersion ? 'yes' : '**no**'}

## CreativeAsset drift

\`\`\`json
${JSON.stringify(creative, null, 2)}
\`\`\`

## Ghost DB files

${audit.ghostDbFiles.length ? audit.ghostDbFiles.map((g) => `- ${g}`).join('\n') : '_none_'}

## Commands

\`\`\`bash
cd apps/core/cardbey-core
npm run db:audit
npm run db:fingerprint
npm run db:baseline:repair-local -- --dry-run
\`\`\`
`;

fs.writeFileSync(latestMd, md);
console.log('[schema-baseline-audit] status:', status);
console.log('[schema-baseline-audit] wrote', jsonPath);
console.log('[schema-baseline-audit] wrote', latestMd);
