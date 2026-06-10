#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import '../src/env/ensureDatabaseUrl.js';
import { resolveSqliteDatabasePath } from '../src/lib/sqliteDbPath.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'prisma', 'sqlite', 'migrations');
const disk = fs.readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const dbPath = resolveSqliteDatabasePath();
const db = new DatabaseSync(dbPath, { readonly: true });
const applied = new Set(
  db.prepare('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL').all().map((r) => r.migration_name),
);
db.close();
const pending = disk.filter((m) => !applied.has(m));
console.log({ dbPath, applied: applied.size, disk: disk.length, pending });
