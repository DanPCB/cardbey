#!/usr/bin/env node
/**
 * Apply pending Prisma migrations to the configured database.
 * Usage: npm run repair-schema
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPostgresDatabaseUrl, pickDatabaseUrlForPrisma } from './prismaSchemaPath.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

await import('../src/env/loadEnv.js');
await import('../src/env/ensureDatabaseUrl.js');

const dbUrl = pickDatabaseUrlForPrisma();
const isPostgres = isPostgresDatabaseUrl(dbUrl);

const schema = isPostgres
  ? 'prisma/postgres/schema.prisma'
  : 'prisma/sqlite/schema.prisma';

console.log(`[repair-schema] provider=${isPostgres ? 'postgres' : 'sqlite'}`);
console.log(`[repair-schema] schema=${schema}`);

const args = ['prisma', 'migrate', 'deploy', '--schema', schema];
const result = spawnSync('npx', args, {
  cwd: root,
  env: { ...process.env, DATABASE_URL: dbUrl },
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status !== 0) {
  console.error('[repair-schema] migrate deploy failed');
  process.exit(result.status ?? 1);
}

console.log('[repair-schema] done — run npm run schema:doctor to verify');
