#!/usr/bin/env node
/**
 * Render DB bootstrap — runs at container start (npm prestart), not pre-deploy.
 * Pre-deploy on Render often fails with no visible logs; start-time output appears in Logs tab.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isPostgresDatabaseUrl,
  pickDatabaseUrlForPrisma,
} from './prismaSchemaPath.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function log(msg) {
  console.log(msg);
}

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

async function main() {
  const startedAt = new Date().toISOString();
  log(`[render-predeploy] start ${startedAt}`);
  log(`[render-predeploy] cwd=${process.cwd()}`);
  log(`[render-predeploy] node=${process.version}`);

  await import('../src/env/ensureDatabaseUrl.js');

  const dbUrl = pickDatabaseUrlForPrisma();
  const scheme = dbUrl ? dbUrl.split(':')[0] : '(unset)';
  log(`[render-predeploy] DATABASE_URL scheme=${scheme}`);

  const onRender = !!(process.env.RENDER_EXTERNAL_URL || process.env.RENDER_SERVICE_ID);
  if (onRender && !isPostgresDatabaseUrl(dbUrl)) {
    fail(
      '[render-predeploy] FATAL: Render Core requires postgresql:// DATABASE_URL (or POSTGRES_DATABASE_URL).\n' +
        '  Dashboard → cardbey-core(-staging) → Environment → link Postgres Internal URL to DATABASE_URL.\n' +
        `  Current scheme: ${scheme}`,
    );
  }

  if (!isPostgresDatabaseUrl(dbUrl)) {
    log('[render-predeploy] not postgres — running bootstrap only');
    runStep('prisma-bootstrap', 'prisma-bootstrap.js');
    log(`[render-predeploy] done ${new Date().toISOString()}`);
    return;
  }

  // Soft-fail: prisma-bootstrap already re-runs allowlisted P3009 resolve + migrate deploy.
  // Hard-failing here left staging with "No open ports" when generate/resolve OOMs or exits 1.
  runStep('resolve-postgres-failed', 'resolve-postgres-failed-migration.mjs', {
    fatal: false,
  });
  runStep('prisma-bootstrap', 'prisma-bootstrap.js');
  log(`[render-predeploy] done ${new Date().toISOString()}`);
}

function runStep(label, scriptName, opts = {}) {
  const fatal = opts.fatal !== false;
  const scriptPath = path.join(root, 'scripts', scriptName);
  log(`[render-predeploy] step=${label} script=${scriptName}`);
  const r = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    const detail = `exited ${r.status ?? '?'} signal=${r.signal ?? 'none'} error=${r.error?.message ?? 'none'}`;
    if (fatal) {
      fail(`[render-predeploy] FATAL: ${label} ${detail}`);
    }
    console.warn(`[render-predeploy] WARN: ${label} ${detail} — continuing to next step`);
    return;
  }
  log(`[render-predeploy] step=${label} ok`);
}

main().catch((err) => {
  console.error('[render-predeploy] fatal:', err?.message || err);
  process.exit(1);
});
