import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dbPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'dev-fresh.db');
const db = new DatabaseSync(dbPath, { readonly: true });
const failed = db.prepare(`SELECT migration_name, logs FROM _prisma_migrations WHERE finished_at IS NULL`).all();
console.log('unfinished', failed);
db.close();
