/**
 * Repair SQLite tables whose DDL used Postgres TIMESTAMP(3) (invalid for Prisma SQLite).
 */

/** Tables known to have received TIMESTAMP(3) from drifted migrations. */
export const TIMESTAMP_REPAIR_TABLES = [
  'DraftStore',
  'UnclaimedStore',
  'DiscoverySeedSource',
  'DiscoveryBatchRun',
  'discovery_config',
];

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} table
 * @returns {boolean}
 */
export function tableHasTimestamp3Columns(db, table) {
  const rows = db.prepare(`PRAGMA table_info("${table}")`).all();
  return rows.some((row) => /TIMESTAMP/i.test(String(row.type ?? '')));
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string[]} [tables]
 * @returns {string[]}
 */
export function findTablesWithTimestamp3(db, tables = TIMESTAMP_REPAIR_TABLES) {
  return tables.filter((table) => {
    const exists = Boolean(
      db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table),
    );
    return exists && tableHasTimestamp3Columns(db, table);
  });
}

/**
 * Rebuild a table, replacing TIMESTAMP(3) column types with DATETIME.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} table
 * @returns {boolean} true when repair ran
 */
export function repairTableTimestamp3Columns(db, table) {
  const createRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
    .get(table);
  if (!createRow?.sql || !/TIMESTAMP\(3\)/i.test(createRow.sql)) {
    return false;
  }

  const indexRows = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL",
    )
    .all(table);

  const tempName = `${table}__ts_repair`;
  const fixedCreateSql = createRow.sql
    .replace(/TIMESTAMP\(3\)/gi, 'DATETIME')
    .replace(
      new RegExp(`CREATE TABLE "${table.replace(/"/g, '""')}"`, 'i'),
      `CREATE TABLE "${tempName}"`,
    );

  const cols = db.prepare(`PRAGMA table_info("${table}")`).all();
  const colList = cols.map((c) => `"${c.name}"`).join(', ');

  db.exec('PRAGMA foreign_keys=OFF');
  db.exec('BEGIN');
  try {
    db.exec(fixedCreateSql);
    db.exec(`INSERT INTO "${tempName}" (${colList}) SELECT ${colList} FROM "${table}"`);
    db.exec(`DROP TABLE "${table}"`);
    db.exec(`ALTER TABLE "${tempName}" RENAME TO "${table}"`);
    for (const idx of indexRows) {
      if (idx.sql) db.exec(idx.sql);
    }
    db.exec('COMMIT');
    return true;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys=ON');
  }
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string[]} [tables]
 * @returns {string[]} tables repaired
 */
export function repairAllTimestamp3Columns(db, tables = TIMESTAMP_REPAIR_TABLES) {
  const repaired = [];
  for (const table of findTablesWithTimestamp3(db, tables)) {
    repairTableTimestamp3Columns(db, table);
    repaired.push(table);
  }
  return repaired;
}
