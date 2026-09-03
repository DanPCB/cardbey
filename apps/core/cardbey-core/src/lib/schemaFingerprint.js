/**
 * Canonical schema fingerprinting for Cardbey Core (SQLite dev + Postgres prod).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_DEV_DB,
  PACKAGE_ROOT,
  isGhostSqlitePath,
  resolveSqliteDatabasePath,
} from './sqliteDbPath.js';

const require = createRequire(import.meta.url);

export const SCHEMA_SQLITE_PATH = path.join(PACKAGE_ROOT, 'prisma', 'sqlite', 'schema.prisma');
export const MIGRATIONS_DIR = path.join(PACKAGE_ROOT, 'prisma', 'migrations');
export const FINGERPRINT_JSON_PATH = path.join(PACKAGE_ROOT, 'docs', 'db', 'schema-fingerprint.json');
export const BASELINE_ACCEPTANCE_PATH = path.join(
  PACKAGE_ROOT,
  'docs',
  'db',
  'baseline-acceptance.local.json',
);

export const REQUIRED_COLUMNS = {
  DraftStore: ['publishSnapshot', 'publishSnapshotVersion'],
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function openReadonlySqlite(absolutePath) {
  const { DatabaseSync } = require('node:sqlite');
  return new DatabaseSync(absolutePath, { readonly: true });
}

export function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

export function hashString(s) {
  return hashBuffer(Buffer.from(String(s), 'utf8'));
}

export function readSchemaPrismaHash(schemaPath = SCHEMA_SQLITE_PATH) {
  if (!fs.existsSync(schemaPath)) return null;
  return hashBuffer(fs.readFileSync(schemaPath));
}

export function listMigrationFolderNames(migrationsDir = MIGRATIONS_DIR) {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();
}

export function hashMigrationFolders(migrationsDir = MIGRATIONS_DIR) {
  const names = listMigrationFolderNames(migrationsDir);
  const parts = names.map((name) => {
    const sqlPath = path.join(migrationsDir, name, 'migration.sql');
    const sql = fs.existsSync(sqlPath) ? fs.readFileSync(sqlPath, 'utf8') : '';
    return `${name}:${hashString(sql)}`;
  });
  return hashString(parts.join('\n'));
}

export function schemaProviderFromUrl(url = process.env.DATABASE_URL) {
  const lowered = (url || '').toLowerCase();
  if (lowered.startsWith('postgresql://') || lowered.startsWith('postgres://')) return 'postgres';
  if (lowered.startsWith('prisma://') || lowered.startsWith('prisma+postgres://')) return 'postgres_proxy';
  if (lowered.startsWith('file:')) return 'sqlite';
  return 'unknown';
}

/**
 * Build stable per-table column fingerprint from SQLite.
 * @returns {{ tableColumnHash: string, tables: Record<string, string[]>, tableCount: number }}
 */
export function buildTableColumnFingerprint(dbPath) {
  if (!dbPath || !fs.existsSync(dbPath)) {
    return { tableColumnHash: null, tables: {}, tableCount: 0 };
  }
  const db = openReadonlySqlite(dbPath);
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name);
  /** @type {Record<string, string[]>} */
  const tableMap = {};
  const lines = [];
  for (const table of tables) {
    const cols = db
      .prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`)
      .all()
      .map((r) => `${r.name}:${r.type}:${r.notnull}:${r.dflt_value ?? ''}:${r.pk}`)
      .sort();
    tableMap[table] = cols.map((c) => c.split(':')[0]);
    lines.push(`${table}|${cols.join(',')}`);
  }
  db.close();
  return {
    tableColumnHash: hashString(lines.join('\n')),
    tables: tableMap,
    tableCount: tables.length,
  };
}

export function getAppliedMigrations(dbPath) {
  if (!dbPath || !fs.existsSync(dbPath)) {
    return { migrationCount: 0, applied: [], latestApplied: [] };
  }
  const db = openReadonlySqlite(dbPath);
  let applied = [];
  try {
    applied = db
      .prepare(
        'SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY migration_name',
      )
      .all();
  } catch {
    applied = [];
  }
  db.close();
  const names = applied.map((r) => r.migration_name);
  const uniqueNames = [...new Set(names)];
  return {
    migrationCount: uniqueNames.length,
    applied: uniqueNames,
    latestApplied: applied
      .slice()
      .sort((a, b) => String(b.finished_at).localeCompare(String(a.finished_at)))
      .slice(0, 10)
      .map((r) => r.migration_name),
  };
}

export function analyzeMigrationDrift(dbPath, migrationsDir = MIGRATIONS_DIR) {
  const folders = listMigrationFolderNames(migrationsDir);
  const { applied } = getAppliedMigrations(dbPath);
  const folderSet = new Set(folders);
  const appliedSet = new Set(applied);
  const missingApplied = folders.filter((f) => !appliedSet.has(f));
  const unappliedInDb = applied.filter((a) => !folderSet.has(a));
  return {
    migrationFolderCount: folders.length,
    missingApplied,
    unappliedInDb,
    latestMigrationFolders: folders.slice(-10),
  };
}

export function inspectCreativeAssetDrift(dbPath) {
  if (!dbPath || !fs.existsSync(dbPath)) {
    return { exists: false };
  }
  const db = openReadonlySqlite(dbPath);
  try {
    const cols = db.prepare('PRAGMA table_info("CreativeAsset")').all();
    const campaignCol = cols.find((c) => c.name === 'campaignId');
    const nullCount = db
      .prepare('SELECT COUNT(*) AS c FROM CreativeAsset WHERE campaignId IS NULL')
      .get()?.c;
    const total = db.prepare('SELECT COUNT(*) AS c FROM CreativeAsset').get()?.c;
    return {
      exists: true,
      campaignIdNotNull: campaignCol?.notnull === 1,
      nullCampaignIdRows: nullCount ?? 0,
      totalRows: total ?? 0,
      driftBlocksDbPush:
        campaignCol?.notnull === 1 && (nullCount ?? 0) > 0,
    };
  } catch (e) {
    return { exists: false, error: e?.message || String(e) };
  } finally {
    db.close();
  }
}

export function findGhostDbFiles(packageRoot = PACKAGE_ROOT) {
  const ghosts = [];
  function walk(dir, depth = 0) {
    if (depth > 10) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full, depth + 1);
      else if (/\.(db|sqlite|sqlite3)$/i.test(ent.name) && isGhostSqlitePath(full)) {
        ghosts.push(full);
      }
    }
  }
  walk(packageRoot);
  return ghosts;
}

export function checkRequiredColumns(tableMap) {
  /** @type {Record<string, Record<string, boolean>>} */
  const result = {};
  let allOk = true;
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    result[table] = {};
    const present = new Set(tableMap[table] || []);
    for (const col of columns) {
      const ok = present.has(col);
      result[table][col] = ok;
      if (!ok) allOk = false;
    }
  }
  return { requiredColumnsOk: allOk, requiredColumns: result };
}

export function loadCommittedFingerprint() {
  if (!fs.existsSync(FINGERPRINT_JSON_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(FINGERPRINT_JSON_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export function getPrismaVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(PACKAGE_ROOT, 'node_modules', 'prisma', 'package.json'), 'utf8'),
    );
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

export function getPrismaClientVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(PACKAGE_ROOT, 'node_modules', '.prisma', 'client-gen', 'package.json'),
        'utf8',
      ),
    );
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Full fingerprint payload (runtime + committed comparison).
 */
export function buildSchemaFingerprint(options = {}) {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL ?? null;
  const provider = schemaProviderFromUrl(databaseUrl || '');
  const resolvedDbPath =
    provider === 'sqlite' ? resolveSqliteDatabasePath(databaseUrl) : null;
  const schemaPrismaHash = readSchemaPrismaHash(options.schemaPath);
  const migrationFoldersHash = hashMigrationFolders(options.migrationsDir);
  const { tableColumnHash, tables, tableCount } =
    provider === 'sqlite' && resolvedDbPath
      ? buildTableColumnFingerprint(resolvedDbPath)
      : { tableColumnHash: null, tables: {}, tableCount: 0 };
  const required =
    provider === 'sqlite' && resolvedDbPath
      ? checkRequiredColumns(tables)
      : provider === 'postgres' || provider === 'postgres_proxy'
        ? { requiredColumnsOk: null, requiredColumns: {} }
        : checkRequiredColumns(tables);
  const migrationDrift =
    provider === 'sqlite' && resolvedDbPath
      ? analyzeMigrationDrift(resolvedDbPath, options.migrationsDir)
      : null;
  const creativeAsset = provider === 'sqlite' && resolvedDbPath
    ? inspectCreativeAssetDrift(resolvedDbPath)
    : null;
  const committed = loadCommittedFingerprint();

  let schemaHashMatch = null;
  let tableHashMatch = null;
  if (committed) {
    schemaHashMatch = committed.schemaPrismaHash === schemaPrismaHash;
    tableHashMatch = committed.tableColumnHash === tableColumnHash;
  }

  return {
    provider,
    databaseUrl,
    resolvedDbPath,
    schemaPrismaHash,
    migrationFoldersHash,
    tableColumnHash,
    tableCount,
    migrationCount: migrationDrift
      ? getAppliedMigrations(resolvedDbPath).migrationCount
      : null,
    prismaVersion: getPrismaVersion(),
    prismaClientVersion: getPrismaClientVersion(),
    requiredColumns: REQUIRED_COLUMNS,
    requiredColumnsOk: required.requiredColumnsOk,
    requiredColumnStatus: required.requiredColumns,
    migrationDrift,
    creativeAssetDrift: creativeAsset,
    ghostDbFiles: findGhostDbFiles(),
    generatedAt: new Date().toISOString(),
    committedFingerprint: committed
      ? {
          schemaPrismaHash: committed.schemaPrismaHash,
          tableColumnHash: committed.tableColumnHash,
          generatedAt: committed.generatedAt,
        }
      : null,
    schemaHashMatch,
    tableHashMatch,
  };
}

export function isLocalDevEnvironment() {
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
    return false;
  }
  if (process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL) {
    return false;
  }
  if (process.env.ALLOW_LOCAL_BASELINE_ACCEPTANCE === 'true') {
    return true;
  }
  return process.env.NODE_ENV !== 'production';
}

export function loadBaselineAcceptance() {
  if (!isLocalDevEnvironment()) return null;
  if (!fs.existsSync(BASELINE_ACCEPTANCE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(BASELINE_ACCEPTANCE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/** Option A: schema + table fingerprint verified on canonical dev DB. */
export function verifyOptionABaseline(fp) {
  const committed = loadCommittedFingerprint();
  if (!committed || !fp) return false;
  if (fp.provider !== 'sqlite' || !fp.resolvedDbPath) return false;
  if (path.resolve(fp.resolvedDbPath) !== path.resolve(CANONICAL_DEV_DB)) return false;
  if (fp.ghostDbFiles?.length) return false;
  if (!fp.requiredColumnsOk) return false;
  if (fp.schemaHashMatch === false || fp.tableHashMatch === false) return false;
  if (committed.schemaPrismaHash !== fp.schemaPrismaHash) return false;
  if (committed.tableColumnHash !== fp.tableColumnHash) return false;
  return true;
}

export function validateBaselineAcceptance(fp, acceptance = loadBaselineAcceptance()) {
  if (!acceptance || !isLocalDevEnvironment()) return false;
  if (!verifyOptionABaseline(fp)) return false;
  return (
    acceptance.schemaPrismaHash === fp.schemaPrismaHash &&
    acceptance.tableColumnHash === fp.tableColumnHash
  );
}

export function writeBaselineAcceptance(fp, reason = 'Option A conservative baseline verified') {
  const drift = fp.migrationDrift;
  const payload = {
    databaseLabel: 'prisma/dev.db',
    schemaPrismaHash: fp.schemaPrismaHash,
    tableColumnHash: fp.tableColumnHash,
    acceptedMigrationCount: fp.migrationCount,
    migrationFolderCount: drift?.migrationFolderCount ?? null,
    acceptedAt: new Date().toISOString(),
    reason,
  };
  fs.mkdirSync(path.dirname(BASELINE_ACCEPTANCE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_ACCEPTANCE_PATH, JSON.stringify(payload, null, 2) + '\n');
  return payload;
}

/**
 * @returns {'ok'|'accepted'|'unsafe'|'unknown'}
 */
export function classifyMigrationHealth(fp) {
  const drift = fp.migrationDrift;
  if (!drift) return 'unknown';
  const missing = drift.missingApplied?.length ?? 0;
  const orphan = drift.unappliedInDb?.length ?? 0;
  if (missing === 0 && orphan === 0) return 'ok';
  if (validateBaselineAcceptance(fp)) return 'accepted';
  return 'unsafe';
}

/** Safe label for health API (no full path in production). */
export function resolvedDbLabel(resolvedDbPath, nodeEnv = process.env.NODE_ENV) {
  if (!resolvedDbPath) return null;
  if (nodeEnv === 'production') {
    if (resolvedDbPath.includes('dev.db')) return 'sqlite-dev';
    if (resolvedDbPath.includes('test.db')) return 'sqlite-test';
    return 'sqlite';
  }
  return path.basename(resolvedDbPath);
}

export function assertSchemaFingerprintAtStartup() {
  const fp = buildSchemaFingerprint();
  const strict = process.env.STRICT_SCHEMA_FINGERPRINT === 'true' || process.env.STRICT_SCHEMA_FINGERPRINT === '1';
  const isProd = process.env.NODE_ENV === 'production';

  console.log(
    '[DB_SCHEMA_FINGERPRINT]',
    JSON.stringify({
      databaseUrl: fp.databaseUrl,
      resolvedDbPath: fp.resolvedDbPath,
      provider: fp.provider,
      schemaPrismaHash: fp.schemaPrismaHash,
      tableColumnHash: fp.tableColumnHash,
      migrationCount: fp.migrationCount,
      prismaClientVersion: fp.prismaClientVersion,
      requiredColumnsOk: fp.requiredColumnsOk,
      migrationHealth: classifyMigrationHealth(fp),
      schemaHashMatch: fp.schemaHashMatch,
      tableHashMatch: fp.tableHashMatch,
    }),
  );

  if (isProd && fp.provider === 'sqlite') {
    throw new Error(
      '[DB_SCHEMA_FINGERPRINT] NODE_ENV=production must not use SQLite DATABASE_URL. Use managed Postgres on Render.',
    );
  }

  if (isProd && !loadCommittedFingerprint()) {
    throw new Error(
      '[DB_SCHEMA_FINGERPRINT] Missing docs/db/schema-fingerprint.json in production build. Run npm run db:fingerprint and commit.',
    );
  }

  const publishOn =
    process.env.PUBLISH_SNAPSHOT_V1 === 'true' || process.env.PUBLISH_SNAPSHOT_V1 === '1';
  if (publishOn && fp.provider === 'sqlite' && !fp.requiredColumnsOk) {
    throw new Error(
      '[DB_SCHEMA_FINGERPRINT] Required DraftStore columns missing for PUBLISH_SNAPSHOT_V1. Run npm run db:migrate:dev',
    );
  }

  if (strict) {
    const committed = loadCommittedFingerprint();
    if (!committed) {
      throw new Error(
        '[DB_SCHEMA_FINGERPRINT] STRICT_SCHEMA_FINGERPRINT=true but docs/db/schema-fingerprint.json is missing. Run npm run db:fingerprint',
      );
    }
    if (committed.schemaPrismaHash !== fp.schemaPrismaHash) {
      throw new Error(
        '[DB_SCHEMA_FINGERPRINT] schema.prisma hash mismatch. Run npm run db:fingerprint and commit docs/db/schema-fingerprint.json',
      );
    }
    if (fp.tableColumnHash && committed.tableColumnHash && committed.tableColumnHash !== fp.tableColumnHash) {
      throw new Error(
        '[DB_SCHEMA_FINGERPRINT] Live DB table fingerprint mismatch vs committed. Baseline repair or db:fingerprint update required.',
      );
    }
  }
}

export function buildHealthDbFingerprint() {
  const fp = buildSchemaFingerprint();
  const isProd = process.env.NODE_ENV === 'production';
  const migrationHealth = classifyMigrationHealth(fp);
  const warnings = [];

  if (fp.ghostDbFiles?.length) {
    warnings.push(`ghost_db_files:${fp.ghostDbFiles.length}`);
  }
  if (migrationHealth === 'unsafe') {
    warnings.push('migration_history_unsafe');
  }
  if (fp.creativeAssetDrift?.driftBlocksDbPush) {
    warnings.push('creative_asset_campaign_id_null_drift');
  }
  if (fp.schemaHashMatch === false) warnings.push('schema_prisma_hash_mismatch');
  if (fp.tableHashMatch === false) warnings.push('table_column_hash_mismatch');
  if (fp.requiredColumnsOk === false) warnings.push('required_columns_missing');
  if (isProd && fp.provider === 'sqlite') warnings.push('sqlite_in_production');

  const migrationOk = migrationHealth === 'ok' || migrationHealth === 'accepted';
  const ok =
    fp.requiredColumnsOk !== false &&
    migrationOk &&
    !(fp.ghostDbFiles?.length) &&
    fp.schemaHashMatch !== false &&
    fp.tableHashMatch !== false &&
    !(isProd && fp.provider === 'sqlite') &&
    !fp.creativeAssetDrift?.driftBlocksDbPush;

  return {
    ok,
    environment: process.env.NODE_ENV || 'development',
    provider: fp.provider,
    databaseKind: fp.provider === 'sqlite' ? 'sqlite' : 'postgres',
    resolvedDbLabel: resolvedDbLabel(fp.resolvedDbPath),
    resolvedDbPath: isProd ? undefined : fp.resolvedDbPath,
    schemaPrismaHash: fp.schemaPrismaHash,
    tableColumnHash: fp.tableColumnHash,
    migrationCount: fp.migrationCount,
    migrationFolderCount: fp.migrationDrift?.migrationFolderCount ?? null,
    prismaClientVersion: fp.prismaClientVersion,
    requiredColumnsOk: fp.requiredColumnsOk,
    migrationHealth,
    baselineAccepted: migrationHealth === 'accepted',
    warnings,
  };
}

/**
 * Live required-column check (Postgres uses information_schema; SQLite uses fingerprint tables).
 * @returns {Promise<{ provider: string, requiredColumnsOk: boolean | null, requiredColumnStatus: object }>}
 */
export async function checkRequiredColumnsLive() {
  const fp = buildSchemaFingerprint();
  if (fp.provider === 'sqlite') {
    return {
      provider: fp.provider,
      requiredColumnsOk: fp.requiredColumnsOk,
      requiredColumnStatus: fp.requiredColumnStatus ?? {},
    };
  }
  if (fp.provider === 'postgres' || fp.provider === 'postgres_proxy') {
    const { getPrismaClient } = await import('./prisma.js');
    const prisma = getPrismaClient();
    /** @type {Record<string, string[]>} */
    const tableMap = {};
    for (const table of Object.keys(REQUIRED_COLUMNS)) {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        table,
      );
      tableMap[table] = (rows || []).map((r) => r.column_name);
    }
    const required = checkRequiredColumns(tableMap);
    return {
      provider: fp.provider,
      requiredColumnsOk: required.requiredColumnsOk,
      requiredColumnStatus: required.requiredColumns,
    };
  }
  return {
    provider: fp.provider,
    requiredColumnsOk: null,
    requiredColumnStatus: {},
  };
}
