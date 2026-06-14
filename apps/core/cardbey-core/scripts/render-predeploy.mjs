#!/usr/bin/env node
/**
 * Render pre-deploy entrypoint — single script with explicit logging.
 * Deploy/build logs live under Events → failed deploy → log output (not runtime Logs tab).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isPostgresDatabaseUrl,
  pickDatabaseUrlForPrisma,
} from './prismaSchemaPath.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const startedAt = new Date().toISOString();

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function fail(msg, code = 1) {
  process.stderr.write(`${msg}\n`);
  process.exit(code);
}

log(`[render-predeploy] start ${startedAt}`);
log(`[render-predeploy] cwd=${process.cwd()}`);
log(`[render-predeploy] node=${process.version}`);

// Load env normalization (logs [env] DB resolution)
await import('../src/env/ensureDatabaseUrl.js');

const dbUrl = pickDatabaseUrlForPrisma();
const scheme = dbUrl ? dbUrl.split(':')[0] : '(unset)';
log(`[render-predeploy] DATABASE_URL scheme=${scheme}`);

if (!isPostgresDatabaseUrl(dbUrl)) {
  fail(
    '[render-predeploy] FATAL: Render Core requires postgresql:// DATABASE_URL (or POSTGRES_DATABASE_URL).\n' +
      '  Dashboard → cardbey-core(-staging) → Environment → link Postgres Internal URL to DATABASE_URL.\n' +
      `  Current scheme: ${scheme}`,
  );
}

function runStep(label, scriptName) {
  const scriptPath = path.join(root, 'scripts', scriptName);
  log(`[render-predeploy] step=${label} script=${scriptName}`);
  const r = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: dbUrl, CI: process.env.CI || 'true' },
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    fail(`[render-predeploy] FATAL: ${label} exited ${r.status ?? '?'}`);
  }
  log(`[render-predeploy] step=${label} ok`);
}

runStep('resolve-postgres-failed', 'resolve-postgres-failed-migration.mjs');
runStep('prisma-bootstrap', 'prisma-bootstrap.js');

log(`[render-predeploy] done ${new Date().toISOString()}`);
