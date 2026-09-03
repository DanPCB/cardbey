#!/usr/bin/env node
/**
 * Post-deploy synthetic canary — read-only health first, then optional import smoke.
 *
 * Usage (from apps/core/cardbey-core):
 *   API_BASE=https://cardbey-core.onrender.com node scripts/post-deploy-canary.mjs
 *   EXPECTED_COMMIT_SHA=abc123 API_BASE=... node scripts/post-deploy-canary.mjs
 *   node scripts/post-deploy-canary.mjs --smoke-imports
 *   npm run canary:post-deploy
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_BASE = (process.env.API_BASE || 'http://localhost:3001').replace(/\/$/, '');
const EXPECTED_SHA = (process.env.EXPECTED_COMMIT_SHA || process.env.EXPECTED_GIT_COMMIT || '').trim();
const SMOKE_IMPORTS = process.argv.includes('--smoke-imports');
const TIMEOUT_MS = Number(process.env.CANARY_TIMEOUT_MS || 30_000);

const failures = [];

function fail(msg) {
  failures.push(msg);
  console.error(`[canary] FAIL: ${msg}`);
}

function pass(msg) {
  console.log(`[canary] OK: ${msg}`);
}

function shaMatches(actual, expected) {
  const a = String(actual || '').toLowerCase();
  const e = String(expected || '').toLowerCase();
  if (!a || !e || a === 'unknown') return false;
  return a === e || a.startsWith(e) || e.startsWith(a);
}

async function fetchJson(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const body = res.headers.get('content-type')?.includes('json')
      ? await res.json().catch(() => null)
      : null;
    return { res, body };
  } finally {
    clearTimeout(timer);
  }
}

async function checkHealthSimple() {
  const { res, body } = await fetchJson(`${API_BASE}/api/health`);
  if (!res.ok) {
    fail(`/api/health returned ${res.status}`);
    return;
  }
  if (body?.ok !== true) {
    fail('/api/health ok !== true');
    return;
  }
  pass(`/api/health ok (env=${body.env || '?'})`);
}

async function checkHealthFull() {
  const { res, body } = await fetchJson(`${API_BASE}/api/health?full=true`);
  if (!res.ok) {
    fail(`/api/health?full=true returned ${res.status}`);
    return null;
  }

  const deploy = body?.deploy;
  if (!deploy?.commitSha) {
    fail('/api/health?full=true missing deploy.commitSha');
  } else if (deploy.commitSha === 'unknown') {
    fail('deploy.commitSha is unknown — set RENDER_GIT_COMMIT/GIT_COMMIT or run write-build-metadata at build');
  } else {
    pass(`deploy.commitSha=${deploy.commitSha.slice(0, 12)} (source=${deploy.source || '?'})`);
  }

  if (EXPECTED_SHA && deploy?.commitSha) {
    if (shaMatches(deploy.commitSha, EXPECTED_SHA)) {
      pass(`commit matches EXPECTED_COMMIT_SHA (${EXPECTED_SHA.slice(0, 12)})`);
    } else {
      fail(
        `commit mismatch: live=${deploy.commitSha.slice(0, 12)} expected=${EXPECTED_SHA.slice(0, 12)}`,
      );
    }
  }

  if (deploy?.buildTime) {
    pass(`deploy.buildTime=${deploy.buildTime}`);
  }

  const dbFp = body?.dbFingerprint;
  if (dbFp && dbFp.requiredColumnsOk === false) {
    fail('dbFingerprint.requiredColumnsOk is false — schema drift detected');
  } else if (dbFp?.requiredColumnsOk === true) {
    pass('dbFingerprint.requiredColumnsOk=true');
  }

  if (body?.features && typeof body.features === 'object') {
    pass('features snapshot present');
  } else {
    fail('/api/health?full=true missing features snapshot');
  }

  if (body?.database?.ok === false) {
    fail(`database unhealthy: ${body.database.error || body.database.reason || 'unknown'}`);
  } else if (body?.database?.ok === true) {
    pass(`database ok (${body.database.dialect || 'connected'})`);
  }

  return body;
}

async function checkReadyz() {
  const { res, body } = await fetchJson(`${API_BASE}/api/readyz`);
  if (!res.ok) {
    fail(`/api/readyz returned ${res.status} (ok=${body?.ok})`);
    return;
  }
  if (body?.ok !== true) {
    fail(`/api/readyz not ready: ${JSON.stringify(body)}`);
    return;
  }
  pass('/api/readyz ok');
}

function runImportSmoke() {
  console.log('[canary] running local create-store runtime import smoke...');
  const script = path.join(root, 'scripts', 'smoke-create-store-runtime-graph.mjs');
  const r = spawnSync(process.execPath, [script], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) {
    fail('smoke-create-store-runtime-graph import check failed');
    return;
  }
  pass('create-store runtime import graph OK');
}

async function main() {
  console.log(`[canary] target=${API_BASE}`);
  if (EXPECTED_SHA) console.log(`[canary] expected commit=${EXPECTED_SHA.slice(0, 12)}`);
  if (SMOKE_IMPORTS) console.log('[canary] --smoke-imports enabled');

  try {
    await checkHealthSimple();
    await checkHealthFull();
    await checkReadyz();
  } catch (err) {
    fail(err?.name === 'AbortError' ? `request timed out after ${TIMEOUT_MS}ms` : (err?.message || String(err)));
  }

  if (SMOKE_IMPORTS) {
    runImportSmoke();
  }

  if (failures.length) {
    console.error(`\n[canary] ${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log('\n[canary] all checks passed');
}

main();
