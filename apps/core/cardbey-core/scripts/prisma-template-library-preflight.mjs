#!/usr/bin/env node
/**
 * Read-only Template Library preflight for PostgreSQL.
 *
 * Does NOT apply migrations, does NOT run `migrate resolve`, does NOT db push.
 *
 * Usage (disposable or operator-supplied URL only):
 *   DATABASE_URL=postgresql://... node scripts/prisma-template-library-preflight.mjs
 *
 * Requires `psql` on PATH (postgresql-client).
 *
 * Exit:
 *   0  tables absent (safe to migrate deploy) OR fully applied with history
 *   2  tables exist without `_prisma_migrations` row — STOP; manual reconcile
 *   3  partial cluster or shape mismatch — STOP
 *   1  usage / connection / not-postgres
 */
import { spawnSync } from 'node:child_process';

const MIGRATION_NAME = '20260815180000_template_library_catchup';

const EXPECTED_TABLES = [
  'TemplateLibrary',
  'ContentTemplate',
  'ContentTemplateVersion',
  'TemplateInstance',
  'TemplateAsset',
  'TemplateFavorite',
];

const EXPECTED_COLUMNS = {
  TemplateLibrary: [
    'id', 'name', 'slug', 'description', 'ownerType', 'ownerId', 'visibility',
    'status', 'thumbnailUrl', 'category', 'tags', 'sortOrder', 'createdAt', 'updatedAt',
  ],
  ContentTemplate: [
    'id', 'libraryId', 'name', 'slug', 'description', 'contentType', 'industry',
    'useCase', 'status', 'visibility', 'currentVersionId', 'thumbnailUrl',
    'previewUrls', 'tags', 'supportedChannels', 'supportedLocales', 'qualityScore',
    'usageCount', 'legacyCreativeTemplateId', 'createdBy', 'createdAt', 'updatedAt',
  ],
  ContentTemplateVersion: [
    'id', 'templateId', 'versionNumber', 'schemaVersion', 'definition', 'defaultData',
    'fieldDefinitions', 'themeDefinition', 'layoutDefinition', 'assetManifest',
    'supportedVariants', 'renderPolicy', 'validationRules', 'changelog', 'createdBy',
    'createdAt', 'publishedAt', 'immutableAfterPublish',
  ],
  TemplateInstance: [
    'id', 'templateId', 'templateVersionId', 'ownerType', 'ownerId', 'storeId', 'name',
    'contentType', 'status', 'data', 'themeOverrides', 'layoutOverrides', 'assetBindings',
    'selectedVariant', 'locale', 'generatedArtifactId', 'sourceMissionId',
    'idempotencyKey', 'revision', 'createdBy', 'createdAt', 'updatedAt', 'publishedAt',
  ],
  TemplateAsset: [
    'id', 'templateVersionId', 'templateInstanceId', 'assetType', 'sourceType',
    'publicUrl', 'storageKey', 'mimeType', 'width', 'height', 'duration',
    'attribution', 'licence', 'createdAt',
  ],
  TemplateFavorite: ['id', 'userId', 'templateId', 'createdAt'],
};

const EXPECTED_INDEXES = [
  'TemplateLibrary_pkey',
  'TemplateLibrary_slug_key',
  'TemplateLibrary_ownerType_ownerId_idx',
  'TemplateLibrary_status_visibility_idx',
  'TemplateLibrary_category_idx',
  'ContentTemplate_pkey',
  'ContentTemplate_contentType_status_idx',
  'ContentTemplate_industry_idx',
  'ContentTemplate_status_visibility_idx',
  'ContentTemplate_libraryId_slug_key',
  'ContentTemplateVersion_pkey',
  'ContentTemplateVersion_templateId_idx',
  'ContentTemplateVersion_publishedAt_idx',
  'ContentTemplateVersion_templateId_versionNumber_key',
  'TemplateInstance_pkey',
  'TemplateInstance_templateId_idx',
  'TemplateInstance_templateVersionId_idx',
  'TemplateInstance_ownerType_ownerId_idx',
  'TemplateInstance_storeId_idx',
  'TemplateInstance_status_idx',
  'TemplateInstance_createdBy_idx',
  'TemplateInstance_idempotencyKey_key',
  'TemplateAsset_pkey',
  'TemplateAsset_templateVersionId_idx',
  'TemplateAsset_templateInstanceId_idx',
  'TemplateFavorite_pkey',
  'TemplateFavorite_userId_idx',
  'TemplateFavorite_userId_templateId_key',
];

const EXPECTED_FKS = [
  'ContentTemplate_libraryId_fkey',
  'ContentTemplateVersion_templateId_fkey',
  'TemplateInstance_templateId_fkey',
  'TemplateInstance_templateVersionId_fkey',
  'TemplateAsset_templateVersionId_fkey',
  'TemplateAsset_templateInstanceId_fkey',
];

function isPostgresUrl(url) {
  const u = String(url ?? '').trim().toLowerCase();
  return u.startsWith('postgresql://') || u.startsWith('postgres://');
}

function pickUrl() {
  return [process.env.POSTGRES_DATABASE_URL, process.env.DATABASE_URL, process.env.POSTGRES_URL]
    .find(isPostgresUrl) || '';
}

function quoteList(values) {
  return values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');
}

function psql(url, sql) {
  const exe = process.env.PSQL_PATH || 'psql';
  const res = spawnSync(exe, [url, '-v', 'ON_ERROR_STOP=1', '-At', '-F', ',', '-c', sql], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (res.error && res.error.code === 'ENOENT') {
    throw new Error('psql not found on PATH. Install postgresql-client or set PSQL_PATH.');
  }
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || '').trim();
    const wrapped = new Error(err || `psql exit ${res.status}`);
    wrapped.status = res.status;
    throw wrapped;
  }
  return (res.stdout || '').trim();
}

function lines(stdout) {
  return stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function printReconciliation() {
  console.error(`
MANUAL RECONCILIATION (environment-specific; do not automate)
1. Confirm this URL is the intended database (staging vs local vs production).
2. Compare this report's columns / indexes / FKs to EXPECTED_* in this script.
3. If the cluster matches exactly and only history is missing:
   a human may mark this migration applied ON THAT DATABASE ONLY:
     npx prisma migrate resolve --applied ${MIGRATION_NAME} --schema prisma/postgres/schema.prisma
   This script will not run that command.
4. If columns/indexes differ, do not drop objects. Write a new additive migration
   or repair that environment by hand. Do not db push. Do not baseline.
5. Re-run migrate deploy only after history and objects agree.
`);
}

const url = pickUrl();
if (!url) {
  console.error('[template-library-preflight] Need a postgresql:// URL in DATABASE_URL or POSTGRES_DATABASE_URL.');
  process.exit(1);
}

try {
  const present = lines(psql(url, `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (${quoteList(EXPECTED_TABLES)})
    ORDER BY table_name
  `));
  console.log('[template-library-preflight] tables_present', present);
  console.log('[template-library-preflight] tables_absent', EXPECTED_TABLES.filter((t) => !present.includes(t)));

  let historyApplied = false;
  try {
    const history = lines(psql(url, `
      SELECT migration_name
      FROM "_prisma_migrations"
      WHERE migration_name = '${MIGRATION_NAME}'
        AND rolled_back_at IS NULL
    `));
    historyApplied = history.includes(MIGRATION_NAME);
    console.log('[template-library-preflight] history_row', history);
  } catch (e) {
    console.log('[template-library-preflight] _prisma_migrations unreadable:', e.message);
  }

  if (present.length === 0) {
    if (historyApplied) {
      console.error('[template-library-preflight] PREFLIGHT_HISTORY_WITHOUT_TABLES');
      printReconciliation();
      process.exit(3);
    }
    console.log('[template-library-preflight] PREFLIGHT_TABLES_ABSENT — migrate deploy is the empty-database path.');
    process.exit(0);
  }

  const colRows = lines(psql(url, `
    SELECT table_name || '.' || column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (${quoteList(EXPECTED_TABLES)})
    ORDER BY table_name, ordinal_position
  `));
  const haveIdx = lines(psql(url, `
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN (${quoteList(EXPECTED_TABLES)})
    ORDER BY indexname
  `));
  const haveFk = lines(psql(url, `
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND constraint_type = 'FOREIGN KEY'
      AND table_name IN (${quoteList(EXPECTED_TABLES)})
    ORDER BY constraint_name
  `));

  const mismatches = [];
  for (const table of EXPECTED_TABLES) {
    const have = colRows.filter((r) => r.startsWith(`${table}.`)).map((r) => r.slice(table.length + 1)).sort();
    const want = [...EXPECTED_COLUMNS[table]].sort();
    const missing = want.filter((c) => !have.includes(c));
    const extra = have.filter((c) => !want.includes(c));
    if (missing.length || extra.length) {
      mismatches.push({ table, missing, extra, have });
    }
  }

  const missingIdx = EXPECTED_INDEXES.filter((i) => !haveIdx.includes(i));
  const extraIdx = haveIdx.filter((i) => !EXPECTED_INDEXES.includes(i));
  const missingFk = EXPECTED_FKS.filter((i) => !haveFk.includes(i));
  const extraFk = haveFk.filter((i) => !EXPECTED_FKS.includes(i));

  console.log('[template-library-preflight] indexes', haveIdx);
  console.log('[template-library-preflight] fks', haveFk);
  if (mismatches.length) console.log('[template-library-preflight] column_mismatches', mismatches);

  if (present.length !== EXPECTED_TABLES.length) {
    console.error('[template-library-preflight] PREFLIGHT_PARTIAL');
    printReconciliation();
    process.exit(3);
  }
  if (mismatches.length || missingIdx.length || missingFk.length) {
    console.error('[template-library-preflight] PREFLIGHT_SHAPE_MISMATCH', {
      mismatches,
      missingIdx,
      extraIdx,
      missingFk,
      extraFk,
    });
    printReconciliation();
    process.exit(3);
  }

  if (!historyApplied) {
    console.error('[template-library-preflight] PREFLIGHT_ORPHAN_OBJECTS — cluster exists without migration history.');
    printReconciliation();
    process.exit(2);
  }

  console.log('[template-library-preflight] PREFLIGHT_ALREADY_APPLIED — objects and history agree.');
  process.exit(0);
} catch (err) {
  console.error('[template-library-preflight] failed', err?.message || err);
  process.exit(1);
}
