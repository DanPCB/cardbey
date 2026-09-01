import Database from 'better-sqlite3';

const db = new Database('prisma/dev-fresh.db', { readonly: true, timeout: 5000 });
const tables = db
  .prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND (
      name LIKE 'fundraising%' OR name LIKE 'market_%' OR name LIKE 'capital_%' OR name = 'investor_research_gap'
    ) ORDER BY name`,
  )
  .all();
console.log('tables:', tables.map((t) => t.name).join(', ') || '(none)');
try {
  const mig = db
    .prepare(
      `SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name LIKE '%market_graph%' OR migration_name LIKE '%fundraising%' ORDER BY finished_at`,
    )
    .all();
  console.log('migrations:', JSON.stringify(mig, null, 2));
} catch (e) {
  console.log('migration query failed:', e.message);
}
db.close();
