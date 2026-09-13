#!/usr/bin/env node
/**
 * Read-only Commerce/POS Batch 1 preflight for PostgreSQL (inventory + procurement).
 *
 * Does NOT apply migrations, does NOT run `migrate resolve`, does NOT db push.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/prisma-commerce-pos-batch1-preflight.mjs
 *
 * Requires `psql` on PATH (postgresql-client).
 *
 * Exit:
 *   0  PREFLIGHT_TABLES_ABSENT (safe candidate) OR PREFLIGHT_ALREADY_APPLIED
 *   2  PREFLIGHT_ORPHAN_OBJECTS — tables exist without history
 *   3  PREFLIGHT_PARTIAL / PREFLIGHT_SHAPE_MISMATCH / PREFLIGHT_HISTORY_WITHOUT_TABLES
 *   1  usage / connection / not-postgres
 */
import { spawnSync } from 'node:child_process';

const MIGRATION_NAME = '20260815213000_commerce_pos_inventory_catchup_batch1';

const EXPECTED_TABLES = [
  'ProductVariant',
  'Warehouse',
  'InventoryItem',
  'InventoryMovement',
  'Supplier',
  'PurchaseOrder',
  'PurchaseOrderItem',
];

const EXPECTED_COLUMNS = {
  ProductVariant: [
    'id', 'storeId', 'productId', 'sku', 'name', 'price', 'currency', 'metadata',
    'isActive', 'createdAt', 'updatedAt',
  ],
  Warehouse: [
    'id', 'storeId', 'name', 'code', 'isDefault', 'metadata', 'createdAt', 'updatedAt',
  ],
  InventoryItem: [
    'id', 'storeId', 'productId', 'variantId', 'warehouseId', 'sku', 'name', 'unit',
    'metadata', 'createdAt', 'updatedAt',
  ],
  InventoryMovement: [
    'id', 'storeId', 'inventoryItemId', 'movementType', 'quantityDelta', 'reason',
    'sourceType', 'sourceId', 'destinationType', 'destinationId', 'referenceEntityType',
    'referenceEntityId', 'runtimeExecutionId', 'missionId', 'actorUserId', 'metadata',
    'createdAt',
  ],
  Supplier: [
    'id', 'storeId', 'name', 'email', 'phone', 'metadata', 'createdAt', 'updatedAt',
  ],
  PurchaseOrder: [
    'id', 'storeId', 'supplierId', 'status', 'reference', 'expectedAt', 'receivedAt',
    'runtimeExecutionId', 'missionId', 'metadata', 'createdAt', 'updatedAt',
  ],
  PurchaseOrderItem: [
    'id', 'purchaseOrderId', 'productId', 'variantId', 'sku', 'name', 'quantityOrdered',
    'quantityReceived', 'unitCost', 'metadata',
  ],
};

const EXPECTED_INDEXES = [
  'ProductVariant_pkey',
  'ProductVariant_storeId_idx',
  'ProductVariant_productId_idx',
  'ProductVariant_storeId_sku_idx',
  'Warehouse_pkey',
  'Warehouse_storeId_idx',
  'Warehouse_storeId_code_key',
  'InventoryItem_pkey',
  'InventoryItem_storeId_idx',
  'InventoryItem_storeId_sku_idx',
  'InventoryItem_warehouseId_idx',
  'InventoryMovement_pkey',
  'InventoryMovement_storeId_createdAt_idx',
  'InventoryMovement_inventoryItemId_createdAt_idx',
  'InventoryMovement_referenceEntityType_referenceEntityId_idx',
  'InventoryMovement_movementType_idx',
  'Supplier_pkey',
  'Supplier_storeId_idx',
  'PurchaseOrder_pkey',
  'PurchaseOrder_storeId_status_idx',
  'PurchaseOrderItem_pkey',
  'PurchaseOrderItem_purchaseOrderId_idx',
];

const EXPECTED_FKS = [
  'ProductVariant_storeId_fkey',
  'ProductVariant_productId_fkey',
  'Warehouse_storeId_fkey',
  'InventoryItem_storeId_fkey',
  'InventoryItem_productId_fkey',
  'InventoryItem_variantId_fkey',
  'InventoryItem_warehouseId_fkey',
  'InventoryMovement_storeId_fkey',
  'InventoryMovement_inventoryItemId_fkey',
  'Supplier_storeId_fkey',
  'PurchaseOrder_storeId_fkey',
  'PurchaseOrder_supplierId_fkey',
  'PurchaseOrderItem_purchaseOrderId_fkey',
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
  console.error('[commerce-pos-batch1-preflight] Need a postgresql:// URL in DATABASE_URL or POSTGRES_DATABASE_URL.');
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
  console.log('[commerce-pos-batch1-preflight] tables_present', present);
  console.log('[commerce-pos-batch1-preflight] tables_absent', EXPECTED_TABLES.filter((t) => !present.includes(t)));

  let historyApplied = false;
  try {
    const history = lines(psql(url, `
      SELECT migration_name
      FROM "_prisma_migrations"
      WHERE migration_name = '${MIGRATION_NAME}'
        AND rolled_back_at IS NULL
    `));
    historyApplied = history.includes(MIGRATION_NAME);
    console.log('[commerce-pos-batch1-preflight] history_row', history);
  } catch (e) {
    console.log('[commerce-pos-batch1-preflight] _prisma_migrations unreadable:', e.message);
  }

  if (present.length === 0) {
    if (historyApplied) {
      console.error('[commerce-pos-batch1-preflight] PREFLIGHT_HISTORY_WITHOUT_TABLES');
      printReconciliation();
      process.exit(3);
    }
    console.log('[commerce-pos-batch1-preflight] PREFLIGHT_TABLES_ABSENT — migrate deploy is the empty-database path.');
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

  console.log('[commerce-pos-batch1-preflight] indexes', haveIdx);
  console.log('[commerce-pos-batch1-preflight] fks', haveFk);
  if (mismatches.length) console.log('[commerce-pos-batch1-preflight] column_mismatches', mismatches);

  if (present.length !== EXPECTED_TABLES.length) {
    console.error('[commerce-pos-batch1-preflight] PREFLIGHT_PARTIAL');
    printReconciliation();
    process.exit(3);
  }
  if (mismatches.length || missingIdx.length || missingFk.length) {
    console.error('[commerce-pos-batch1-preflight] PREFLIGHT_SHAPE_MISMATCH', {
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
    console.error('[commerce-pos-batch1-preflight] PREFLIGHT_ORPHAN_OBJECTS — cluster exists without migration history.');
    printReconciliation();
    process.exit(2);
  }

  console.log('[commerce-pos-batch1-preflight] PREFLIGHT_ALREADY_APPLIED — objects and history agree.');
  process.exit(0);
} catch (err) {
  console.error('[commerce-pos-batch1-preflight] failed', err?.message || err);
  process.exit(1);
}
