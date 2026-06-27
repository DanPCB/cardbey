/**
 * Database schema health verification — tables, columns, migration history.
 * Used at startup (before accepting API traffic) and via `npm run schema:doctor`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  buildTableColumnFingerprint,
  getAppliedMigrations,
  listMigrationFolderNames,
  resolvedDbLabel,
  schemaProviderFromUrl,
} from './schemaFingerprint.js';
import { resolveSqliteDatabasePath } from './sqliteDbPath.js';

const require = createRequire(import.meta.url);
const coreRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Tables required by store engagement + related features. */
export const REQUIRED_TABLES = [
  'StoreActivityEvent',
  'StoreEngagementSnapshot',
  'StoreFollow',
  'StoreReaction',
  'StoreSave',
  'StoreShare',
  'OfferClaim',
];

/** Required columns beyond table existence (table → column names). */
export const REQUIRED_COLUMNS = {
  StorePromo: ['promoType', 'updatedAt'],
  DraftStore: ['publishSnapshot', 'publishSnapshotVersion'],
};

/** Primary migration that introduces engagement tables. */
export const ENGAGEMENT_MIGRATION = '20260626120000_add_store_engagement_models';

/** Migration that adds StorePromo.promoType (required by schemaDoctor). */
export const STORE_PROMO_TYPE_MIGRATION = '20260627120000_add_store_promo_type';

export function resolveMigrationsDir(provider = schemaProviderFromUrl()) {
  if (provider === 'postgres' || provider === 'postgres_proxy') {
    return path.join(coreRoot, 'prisma', 'postgres', 'migrations');
  }
  return path.join(coreRoot, 'prisma', 'sqlite', 'migrations');
}

function openReadonlySqlite(absolutePath) {
  const { DatabaseSync } = require('node:sqlite');
  return new DatabaseSync(absolutePath, { readonly: true });
}

function checkRequiredTables(tableMap) {
  const missingTables = REQUIRED_TABLES.filter((t) => !tableMap[t]);
  return { missingTables, tablesOk: missingTables.length === 0 };
}

function checkRequiredColumns(tableMap) {
  /** @type {Array<{ table: string, column: string }>} */
  const missingColumns = [];
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const present = new Set(tableMap[table] || []);
    for (const col of columns) {
      if (!present.has(col)) missingColumns.push({ table, column: col });
    }
  }
  return { missingColumns, columnsOk: missingColumns.length === 0 };
}

function analyzeMigrationDriftForDir(dbPath, migrationsDir) {
  const folders = listMigrationFolderNames(migrationsDir);
  const { applied } = getAppliedMigrations(dbPath);
  const appliedSet = new Set(applied);
  const missingApplied = folders.filter((f) => !appliedSet.has(f));
  return {
    migrationFolderCount: folders.length,
    appliedCount: applied.length,
    missingApplied,
    latestMigrationFolders: folders.slice(-5),
  };
}

async function inspectPostgresSchema(prisma) {
  const tableRows = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  /** @type {Record<string, string[]>} */
  const tableMap = {};
  for (const row of tableRows) {
    const name = row.table_name;
    tableMap[name] = [];
  }

  const columnRows = await prisma.$queryRaw`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `;
  for (const row of columnRows) {
    const t = row.table_name;
    if (!tableMap[t]) tableMap[t] = [];
    tableMap[t].push(row.column_name);
  }

  let applied = [];
  try {
    const migRows = await prisma.$queryRaw`
      SELECT migration_name FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL
      ORDER BY migration_name
    `;
    applied = migRows.map((r) => r.migration_name);
  } catch {
    applied = [];
  }

  return { tableMap, appliedMigrations: applied };
}

/**
 * @param {object} [options]
 * @param {import('@prisma/client').PrismaClient} [options.prisma]
 * @param {string} [options.databaseUrl]
 * @param {boolean} [options.includeOptionalDraftStoreColumns]
 * @returns {Promise<SchemaDoctorReport>}
 */
export async function runSchemaDoctor(options = {}) {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL ?? '';
  const provider = schemaProviderFromUrl(databaseUrl);
  const migrationsDir = resolveMigrationsDir(provider);
  const resolvedDbPath = provider === 'sqlite' ? resolveSqliteDatabasePath(databaseUrl) : null;

  /** @type {Record<string, string[]>} */
  let tableMap = {};
  let appliedMigrations = [];
  let migrationDrift = null;

  if (provider === 'sqlite') {
    if (!resolvedDbPath || !fs.existsSync(resolvedDbPath)) {
      return buildReport({
        provider,
        databaseUrl,
        resolvedDbPath,
        migrationsDir,
        tableMap: {},
        missingTables: [...REQUIRED_TABLES],
        missingColumns: collectAllRequiredColumns(options),
        missingMigrations: listMigrationFolderNames(migrationsDir),
        tablesOk: false,
        columnsOk: false,
        migrationsOk: false,
        dbExists: false,
      });
    }
    const fp = buildTableColumnFingerprint(resolvedDbPath);
    tableMap = fp.tables;
    const mig = getAppliedMigrations(resolvedDbPath);
    appliedMigrations = mig.applied;
    migrationDrift = analyzeMigrationDriftForDir(resolvedDbPath, migrationsDir);
  } else if (provider === 'postgres' || provider === 'postgres_proxy') {
    const prisma = options.prisma;
    if (!prisma) {
      throw new Error('[schemaDoctor] Postgres inspection requires a Prisma client');
    }
    const inspected = await inspectPostgresSchema(prisma);
    tableMap = inspected.tableMap;
    appliedMigrations = inspected.appliedMigrations;
    const folders = listMigrationFolderNames(migrationsDir);
    const appliedSet = new Set(appliedMigrations);
    migrationDrift = {
      migrationFolderCount: folders.length,
      appliedCount: appliedMigrations.length,
      missingApplied: folders.filter((f) => !appliedSet.has(f)),
      latestMigrationFolders: folders.slice(-5),
    };
  }

  const { missingTables, tablesOk } = checkRequiredTables(tableMap);
  const columnCheck = checkRequiredColumnsFiltered(tableMap, options);
  const missingMigrations = migrationDrift?.missingApplied ?? [];
  const migrationsOk = missingMigrations.length === 0;

  const requiredMigration =
    missingMigrations.includes(ENGAGEMENT_MIGRATION) ||
    missingTables.length > 0
      ? ENGAGEMENT_MIGRATION
      : columnCheck.missingColumns.some((c) => c.table === 'StorePromo' && c.column === 'promoType')
        ? STORE_PROMO_TYPE_MIGRATION
        : missingMigrations[0] ?? null;

  return buildReport({
    provider,
    databaseUrl,
    resolvedDbPath,
    migrationsDir,
    tableMap,
    missingTables,
    missingColumns: columnCheck.missingColumns,
    missingMigrations,
    tablesOk,
    columnsOk: columnCheck.columnsOk,
    migrationsOk,
    requiredMigration,
    migrationDrift,
    appliedMigrations,
    dbExists: true,
  });
}

function collectAllRequiredColumns(options) {
  const out = [];
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    if (table === 'DraftStore' && !options.includeOptionalDraftStoreColumns) continue;
    for (const column of columns) out.push({ table, column });
  }
  return out;
}

function checkRequiredColumnsFiltered(tableMap, options) {
  const filtered = { ...REQUIRED_COLUMNS };
  if (!options.includeOptionalDraftStoreColumns) {
    delete filtered.DraftStore;
  }
  /** @type {Array<{ table: string, column: string }>} */
  const missingColumns = [];
  for (const [table, columns] of Object.entries(filtered)) {
    const present = new Set(tableMap[table] || []);
    for (const col of columns) {
      if (!present.has(col)) missingColumns.push({ table, column: col });
    }
  }
  return { missingColumns, columnsOk: missingColumns.length === 0 };
}

function buildReport(fields) {
  const ok =
    fields.dbExists !== false &&
    fields.tablesOk &&
    fields.columnsOk &&
    fields.migrationsOk;

  return {
    ok,
    provider: fields.provider,
    databaseUrl: fields.databaseUrl,
    resolvedDbPath: fields.resolvedDbPath,
    resolvedDbLabel: resolvedDbLabel(fields.resolvedDbPath),
    migrationsDir: fields.migrationsDir,
    tablesOk: fields.tablesOk,
    columnsOk: fields.columnsOk,
    migrationsOk: fields.migrationsOk,
    missingTables: fields.missingTables,
    missingColumns: fields.missingColumns,
    missingMigrations: fields.missingMigrations,
    requiredMigration: fields.requiredMigration ?? null,
    migrationDrift: fields.migrationDrift ?? null,
    appliedMigrationCount: fields.appliedMigrations?.length ?? 0,
    suggestedActions: buildSuggestedActions(fields),
  };
}

function buildSuggestedActions(fields) {
  const actions = [];
  if (!fields.migrationsOk || fields.missingTables?.length) {
    if (fields.provider === 'sqlite') {
      actions.push('npx prisma migrate deploy --schema prisma/sqlite/schema.prisma');
    } else {
      actions.push('npx prisma migrate deploy --schema prisma/postgres/schema.prisma');
      actions.push('npm run prisma:migrate:postgres');
    }
    actions.push('npm run repair-schema');
  }
  return [...new Set(actions)];
}

/**
 * @param {SchemaDoctorReport} report
 * @returns {string}
 */
export function formatSchemaDoctorReport(report) {
  const lines = ['', 'Database Schema Verification', ''];

  if (report.missingTables.length) {
    lines.push('Missing tables:');
    for (const t of report.missingTables) lines.push(`  ✗ ${t}`);
  } else {
    lines.push('Missing tables: (none)');
  }

  lines.push('');
  if (report.missingColumns.length) {
    lines.push('Missing columns:');
    for (const { table, column } of report.missingColumns) {
      lines.push(`  ✗ ${table}.${column}`);
    }
  } else {
    lines.push('Missing columns: (none)');
  }

  lines.push('');
  if (report.missingMigrations.length) {
    lines.push('Missing migrations:');
    for (const m of report.missingMigrations.slice(0, 10)) lines.push(`  ✗ ${m}`);
    if (report.missingMigrations.length > 10) {
      lines.push(`  … and ${report.missingMigrations.length - 10} more`);
    }
  } else {
    lines.push('Missing migrations: (none)');
  }

  if (report.requiredMigration) {
    lines.push('');
    lines.push(`Required migration: ${report.requiredMigration}`);
  }

  lines.push('');
  lines.push(`Tables:    ${report.tablesOk ? '✓ OK' : '✗ INCOMPATIBLE'}`);
  lines.push(`Columns:   ${report.columnsOk ? '✓ OK' : '✗ INCOMPATIBLE'}`);
  lines.push(`Migrations: ${report.migrationsOk ? '✓ OK' : '✗ MISSING'}`);
  lines.push('');
  lines.push(`Status: ${report.ok ? 'Database compatible with application.' : 'Database incompatible with application.'}`);

  if (!report.ok && report.suggestedActions?.length) {
    lines.push('');
    lines.push('Suggested action:');
    for (const a of report.suggestedActions) lines.push(`  ${a}`);
  }

  if (report.resolvedDbPath && process.env.NODE_ENV !== 'production') {
    lines.push('');
    lines.push(`Database: ${report.resolvedDbPath}`);
  } else if (report.resolvedDbLabel) {
    lines.push('');
    lines.push(`Database: ${report.resolvedDbLabel} (${report.provider})`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Startup hook — warn in dev, fail in production/staging.
 * @returns {Promise<SchemaDoctorReport>}
 */
export async function verifyDatabaseSchemaAtStartup(options = {}) {
  if (process.env.SKIP_SCHEMA_DOCTOR === '1' || process.env.SKIP_SCHEMA_DOCTOR === 'true') {
    return { ok: true, skipped: true };
  }
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    return { ok: true, skipped: true };
  }

  const { getPrismaClient } = await import('./prisma.js');
  const report = await runSchemaDoctor({
    prisma: getPrismaClient(),
    includeOptionalDraftStoreColumns:
      process.env.PUBLISH_SNAPSHOT_V1 === 'true' || process.env.PUBLISH_SNAPSHOT_V1 === '1',
    ...options,
  });

  const formatted = formatSchemaDoctorReport(report);

  if (report.ok) {
    console.log(formatted);
    return report;
  }

  const isStrict =
    process.env.NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'staging' ||
    process.env.SCHEMA_DOCTOR_STRICT === '1' ||
    process.env.SCHEMA_DOCTOR_STRICT === 'true';

  if (isStrict) {
    console.error(formatted);
    throw new Error(
      '[schemaDoctor] Database schema incompatible with application. Run npm run schema:doctor for details.',
    );
  }

  console.error(formatted);
  console.error(
    '[schemaDoctor] ⚠️  Development mode — server will start but APIs may throw P2021/P2022 until migrations are applied.',
  );
  console.error('[schemaDoctor] Fix: npm run repair-schema  (or npm run schema:doctor)');
  return report;
}

/**
 * @typedef {object} SchemaDoctorReport
 * @property {boolean} ok
 * @property {string} provider
 * @property {boolean} tablesOk
 * @property {boolean} columnsOk
 * @property {boolean} migrationsOk
 * @property {string[]} missingTables
 * @property {Array<{table: string, column: string}>} missingColumns
 * @property {string[]} missingMigrations
 * @property {string | null} requiredMigration
 * @property {string[]} suggestedActions
 * @property {string} [resolvedDbPath]
 * @property {string} [resolvedDbLabel]
 * @property {boolean} [skipped]
 */
