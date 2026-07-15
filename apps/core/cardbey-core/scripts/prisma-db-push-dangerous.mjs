#!/usr/bin/env node
/**
 * Explicit opt-in wrapper for legacy test db push.
 * Requires ALLOW_PRISMA_DB_PUSH_ACCEPT_DATA_LOSS=1 and a file: DATABASE_URL
 * that looks like a test DB (test.db / :memory: / empty).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.env.ALLOW_PRISMA_DB_PUSH_ACCEPT_DATA_LOSS !== '1') {
  console.error(
    '[prisma-safety] Set ALLOW_PRISMA_DB_PUSH_ACCEPT_DATA_LOSS=1 to acknowledge data loss risk.',
  );
  process.exit(1);
}

const url = process.env.DATABASE_URL || '';
const looksLikeTest =
  url.includes('test.db') ||
  url.includes(':memory:') ||
  process.env.NODE_ENV === 'test';

if (!looksLikeTest) {
  console.error(
    '[prisma-safety] Refusing dangerous push: DATABASE_URL does not look like a test database.',
  );
  console.error('URL:', url || '(unset)');
  process.exit(1);
}

const schema = path.join(root, 'prisma', 'sqlite', 'schema.prisma');
const result = spawnSync(
  'npx',
  ['prisma', 'db', 'push', `--schema=${schema}`, '--accept-data-loss'],
  { cwd: root, stdio: 'inherit', shell: true, env: process.env },
);
process.exit(result.status ?? 1);
