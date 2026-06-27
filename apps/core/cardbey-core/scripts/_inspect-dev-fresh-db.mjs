import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dbPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'dev-fresh.db');
const db = new DatabaseSync(dbPath, { readonly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('tableCount', tables.length);
console.log('sample', tables.slice(0, 20).map((t) => t.name));
try {
  const mig = db.prepare('SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at').all();
  console.log('appliedMigrations', mig.length);
  console.log('applied', mig.map((m) => m.migration_name));
} catch (e) {
  console.log('_prisma_migrations', e.message);
}
const userCols = db.prepare('PRAGMA table_info("User")').all().map((c) => c.name);
console.log('User columns include emailVerified:', userCols.includes('emailVerified'));
console.log('User columns include verificationTokenRaw:', userCols.includes('verificationTokenRaw'));
db.close();
