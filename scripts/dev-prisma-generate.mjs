#!/usr/bin/env node
/**
 * Regenerate Prisma client for local SQLite dev (canonical schema path).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { CORE_DIR, SQLITE_SCHEMA_REL } from './dev-constants.mjs';

if (process.platform === 'win32') {
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/prisma-generate-sqlite.ps1'],
    { cwd: CORE_DIR, stdio: 'inherit' },
  );
  process.exit(r.status ?? 1);
}

const r = spawnSync('npx', ['prisma', 'generate', '--schema', SQLITE_SCHEMA_REL], {
  cwd: CORE_DIR,
  stdio: 'inherit',
  shell: true,
});
process.exit(r.status ?? 1);
