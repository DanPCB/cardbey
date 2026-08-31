import { DatabaseSync } from 'node:sqlite';
const d = new DatabaseSync('prisma/dev-fresh.db');
const rows = d
  .prepare(
    "SELECT id, name FROM Business WHERE name LIKE '%DELETED_P3_FIXTURE%' OR name LIKE '%P3 Closure%'",
  )
  .all();
for (const r of rows) {
  try {
    d.prepare('DELETE FROM ContentEditProposal WHERE storeId = ?').run(r.id);
  } catch {}
  try {
    d.prepare('DELETE FROM AuditEvent WHERE entityId = ?').run(r.id);
  } catch {}
  d.prepare('DELETE FROM Business WHERE id = ?').run(r.id);
  console.log('deleted', r.id, r.name);
}
const left = d
  .prepare(
    "SELECT id, name FROM Business WHERE name LIKE '%DELETED_P3_FIXTURE%' OR name LIKE '%P3 Closure%'",
  )
  .all();
console.log(JSON.stringify({ remaining: left }, null, 2));
