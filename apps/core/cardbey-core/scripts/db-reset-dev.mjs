#!/usr/bin/env node
/**
 * Reset local dev SQLite (canonical prisma/dev.db only).
 * Refuses production / Render.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.env.NODE_ENV === 'production' || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL) {
  console.error('[db:reset:dev] Refusing to reset database in production/Render.');
  process.exit(1);
}

const env = {
  ...process.env,
  DATABASE_URL: 'file:../dev.db',
  NODE_ENV: 'development',
};

console.log('[db:reset:dev] migrate reset → canonical prisma/dev.db (file:../dev.db)');
const r = spawnSync(
  'npx',
  ['prisma', 'migrate', 'reset', '--force', '--schema', 'prisma/sqlite/schema.prisma'],
  { cwd: root, env, stdio: 'inherit', shell: true },
);
process.exit(r.status ?? 1);
