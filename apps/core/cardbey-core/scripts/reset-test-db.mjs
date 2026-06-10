/**
 * Delete and rebuild the shared SQLite test database before vitest runs.
 * Fixes "database disk image is malformed" from interrupted prior runs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CANONICAL_TEST_DB } from '../src/lib/sqliteDbPath.js';

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = CANONICAL_TEST_DB;
const ghostDb = path.join(coreRoot, 'test.db');

for (const target of [dbPath, ghostDb]) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try {
      fs.unlinkSync(target + suffix);
    } catch {
      /* absent is fine */
    }
  }
}

execSync(
  'npx prisma db push --schema prisma/sqlite/schema.prisma --accept-data-loss',
  {
    cwd: coreRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: 'file:../test.db',
      NODE_ENV: 'test',
      PRISMA_CLIENT_ENGINE_TYPE: process.env.PRISMA_CLIENT_ENGINE_TYPE ?? 'binary',
    },
  },
);

console.log('[reset-test-db] rebuilt', dbPath);
