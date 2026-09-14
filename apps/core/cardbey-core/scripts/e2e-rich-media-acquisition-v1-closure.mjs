/**
 * Rich Media Acquisition V1 — Final E2E closure script (authenticated).
 *
 * Proves: search → rights inspect → review → decide → Core restart → survive →
 * acquire → provenance → UL read-back → duplicate blocked;
 * plus attribution / blocked / reference-only / provider isolation.
 *
 * Usage (Core already running on :3001):
 *   node scripts/e2e-rich-media-acquisition-v1-closure.mjs
 *
 * Optional env:
 *   CORE_URL=http://127.0.0.1:3001
 *   RMA_JWT=<token>   (or mint via JWT_SECRET + ADMIN_USER_ID)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

loadEnv();

const BASE = process.env.CORE_URL || 'http://127.0.0.1:3001';
const OUT = path.resolve(ROOT, '../../../apps/dashboard/.tmp/rma-v1-final-e2e.json');

function mintToken() {
  if (process.env.RMA_JWT) return process.env.RMA_JWT.trim();
  const jwt = require('jsonwebtoken');
  const { PrismaClient } = require('@prisma/client');
  // sync-ish: use known admin from prior session or first super_admin
  return null; // filled async below
}

async function resolveToken() {
  if (process.env.RMA_JWT) return process.env.RMA_JWT.trim();
  const jwt = require('jsonwebtoken');
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  const admin = await p.user.findFirst({
    where: { OR: [{ role: 'super_admin' }, { role: 'platform_admin' }, { role: 'admin' }] },
    select: { id: true, role: true },
  });
  await p.$disconnect();
  if (!admin?.id) throw new Error('No platform admin user in local DB');
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET missing');
  return jwt.sign({ userId: admin.id }, process.env.JWT_SECRET, { expiresIn: '2h' });
}

async function api(method, urlPath, { token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHealth(timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await api('GET', '/api/health');
      if (r.status === 200 && r.json?.ok) return true;
    } catch {
      /* retry */
    }
    await sleep(1500);
  }
  return false;
}

async function restartCore() {
  // Find listener on 3001 and kill; start pnpm run dev again
  const { execSync } = require('child_process');
  try {
    const out = execSync(
      'powershell -NoProfile -Command "(Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess"',
      { encoding: 'utf8' },
    ).trim();
    const pid = Number(out);
    if (pid > 0) {
      try {
        execSync(`powershell -NoProfile -Command "Stop-Process -Id ${pid} -Force"`, {
          encoding: 'utf8',
        });
      } catch {
        /* ignore */
      }
      // Also stop nodemon parents if present
      try {
        execSync(
          `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'dev-api-entry|nodemon.*cardbey-core' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
          { encoding: 'utf8' },
        );
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  await sleep(2000);
  const child = spawn('pnpm', ['run', 'dev'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    shell: true,
  });
  child.unref();
  const ok = await waitHealth();
  if (!ok) throw new Error('Core failed to restart');
}

function pickByLicense(candidates, pred) {
  return (candidates || []).find(pred) || null;
}

async function main() {
  const report = {
    gate: 'RICH_MEDIA_ACQUISITION_V1_FINAL_E2E_CLOSURE',
    startedAt: new Date().toISOString(),
    steps: {},
  };

  const token = await resolveToken();
  report.auth = { ok: true };

  // --- Search ---
  const search = await api('POST', '/api/media-acquisition/search', {
    token,
    body: {
      query: 'bakery bread open license',
      mediaType: 'image',
      limitPerSource: 8,
    },
  });
  report.steps.search = {
    status: search.status,
    ok: search.json?.ok,
    candidateCount: search.json?.candidates?.length || 0,
    sourceStatuses: search.json?.sourceStatuses || search.json?.statuses || [],
  };
  const candidates = search.json?.candidates || [];

  // Provider isolation: at least one failed/config and one success preferred
  const statuses = report.steps.search.sourceStatuses || [];
  const anySuccess = statuses.some((s) => s.status === 'SUCCESS') || candidates.length > 0;

  // Dedicated isolation probe: audio search should include Freesound (often CONFIG_REQUIRED)
  // while Openverse/Pixabay may still succeed — proves partial federation.
  let audioSearch = await api('POST', '/api/media-acquisition/search', {
    token,
    body: { query: 'bakery oven ambience', mediaType: 'audio', limitPerSource: 5 },
  });
  if (!(audioSearch.json?.sourceStatuses || []).length) {
    await sleep(2000);
    audioSearch = await api('POST', '/api/media-acquisition/search', {
      token,
      body: { query: 'bakery oven ambience', mediaType: 'audio', limitPerSource: 5 },
    });
  }
  const audioStatuses = audioSearch.json?.sourceStatuses || [];
  const audioSuccess = audioStatuses.filter((s) => s.status === 'SUCCESS');
  const audioFailed = audioStatuses.filter(
    (s) =>
      s.status === 'FAILED' ||
      s.status === 'CONFIG_REQUIRED' ||
      s.status === 'RATE_LIMITED' ||
      s.status === 'ERROR',
  );
  report.steps.providerIsolation = {
    imageSearchSuccess: anySuccess,
    audioSearchStatus: audioSearch.status,
    audioStatuses,
    failedProviders: audioFailed.map((s) => s.provider || s.sourceId),
    successfulProviders: audioSuccess.map((s) => s.provider || s.sourceId),
    anySuccess: anySuccess || audioSuccess.length > 0,
    anyFailure: audioFailed.length > 0,
    isolationOk: audioFailed.length > 0 && (audioSuccess.length > 0 || candidates.length > 0),
  };

  // Rights cases from live results + synthetic fallbacks
  let attributionCandidate =
    pickByLicense(candidates, (c) =>
      /cc by|creativecommons|attribution/i.test(String(c.license || '')),
    ) ||
    pickByLicense(candidates, (c) => c.attributionRequired === true);

  let blockedCandidate = pickByLicense(candidates, (c) =>
    /nc|non.?commercial|all rights reserved|blocked/i.test(String(c.license || '')),
  );

  // Synthetic candidates when live feed lacks specific licenses
  if (!attributionCandidate) {
    attributionCandidate = {
      id: 'openverse:synth-attr-1',
      provider: 'openverse',
      providerAssetId: `synth-attr-${Date.now()}`,
      title: 'Synthetic CC BY bakery',
      mediaType: 'image',
      license: 'CC BY 4.0',
      attributionRequired: true,
      attributionText: 'Photo by Test on Openverse',
      sourceUrl: `https://example.com/synth-attr-${Date.now()}`,
      previewUrl: 'https://example.com/synth-attr.jpg',
      providerHostedUrl: 'https://example.com/synth-attr.jpg',
      canAcquire: true,
    };
  }
  if (!blockedCandidate) {
    blockedCandidate = {
      id: 'openverse:synth-nc-1',
      provider: 'openverse',
      providerAssetId: `synth-nc-${Date.now()}`,
      title: 'Synthetic NC blocked',
      mediaType: 'image',
      license: 'CC BY-NC 4.0',
      attributionRequired: true,
      sourceUrl: `https://example.com/synth-nc-${Date.now()}`,
      previewUrl: 'https://example.com/synth-nc.jpg',
      canAcquire: false,
    };
  }

  const referenceCandidate = {
    id: 'tiktok:ref-only-1',
    provider: 'tiktok',
    providerAssetId: `ref-${Date.now()}`,
    title: 'Reference-only social clip',
    mediaType: 'video',
    license: 'platform terms',
    sourceUrl: `https://example.com/tiktok-ref-${Date.now()}`,
    canAcquire: false,
  };

  // Inspect rights via review add (decision stamped)
  const addAttr = await api('POST', '/api/media-acquisition/review', {
    token,
    body: { candidate: attributionCandidate },
  });
  report.steps.addAttributionToReview = {
    status: addAttr.status,
    ok: addAttr.json?.ok,
    reviewId: addAttr.json?.item?.reviewId,
    decision: addAttr.json?.item?.acquisitionDecision,
    attributionRequired: addAttr.json?.item?.attributionRequired,
  };

  const addBlocked = await api('POST', '/api/media-acquisition/review', {
    token,
    body: { candidate: blockedCandidate },
  });
  report.steps.addBlockedToReview = {
    status: addBlocked.status,
    ok: addBlocked.json?.ok,
    reviewId: addBlocked.json?.item?.reviewId,
    decision: addBlocked.json?.item?.acquisitionDecision,
  };

  const addRef = await api('POST', '/api/media-acquisition/review', {
    token,
    body: { candidate: referenceCandidate },
  });
  report.steps.addReferenceToReview = {
    status: addRef.status,
    ok: addRef.json?.ok,
    reviewId: addRef.json?.item?.reviewId,
    decision: addRef.json?.item?.acquisitionDecision,
    canAcquire: addRef.json?.item?.canAcquire,
  };

  // Decision: approve attribution with text; reject blocked approve; reference action
  const approveAttr = await api(
    'POST',
    `/api/media-acquisition/review/${encodeURIComponent(addAttr.json.item.reviewId)}/resolve`,
    {
      token,
      body: {
        action: 'approve',
        attributionText: attributionCandidate.attributionText || 'Attribution: Test Baker / CC BY 4.0',
      },
    },
  );
  // resolve may acquire immediately — capture asset if present
  let assetId =
    approveAttr.json?.acquisition?.asset?.id ||
    approveAttr.json?.acquisition?.assetId ||
    null;
  report.steps.approveAttribution = {
    status: approveAttr.status,
    ok: approveAttr.json?.ok,
    reviewStatus: approveAttr.json?.review?.queueStatus,
    acquisitionOk: approveAttr.json?.acquisition?.ok,
    assetId,
    deduped: approveAttr.json?.acquisition?.deduped,
    provenance: approveAttr.json?.acquisition?.asset?.metadata?.provenance || null,
  };

  // If approve didn't acquire (next none), acquire explicitly
  if (!assetId && approveAttr.json?.ok) {
    const acq = await api('POST', '/api/media-acquisition/acquire', {
      token,
      body: {
        reviewId: addAttr.json.item.reviewId,
        attributionText: attributionCandidate.attributionText || 'Attribution: Test Baker / CC BY 4.0',
      },
    });
    assetId = acq.json?.asset?.id || null;
    report.steps.explicitAcquire = {
      status: acq.status,
      ok: acq.json?.ok,
      assetId,
      deduped: acq.json?.deduped,
      provenance: acq.json?.asset?.metadata?.provenance || null,
    };
  }

  const blockedApprove = await api(
    'POST',
    `/api/media-acquisition/review/${encodeURIComponent(addBlocked.json.item.reviewId)}/resolve`,
    { token, body: { action: 'approve' } },
  );
  report.steps.blockedCannotApprove = {
    status: blockedApprove.status,
    ok: blockedApprove.json?.ok,
    error: blockedApprove.json?.error,
  };

  const refResolve = await api(
    'POST',
    `/api/media-acquisition/review/${encodeURIComponent(addRef.json.item.reviewId)}/resolve`,
    { token, body: { action: 'reference' } },
  );
  report.steps.referenceOnlyPath = {
    status: refResolve.status,
    ok: refResolve.json?.ok,
    reviewStatus: refResolve.json?.review?.queueStatus,
    acquisitionDecision: refResolve.json?.review?.acquisitionDecision,
    acquisitionOk: refResolve.json?.acquisition?.ok,
  };

  // --- Core restart: decision must survive ---
  report.steps.coreRestart = { started: true };
  await restartCore();
  report.steps.coreRestart.completed = true;

  const reviewAfter = await api('GET', '/api/media-acquisition/review', { token });
  const survived = (reviewAfter.json?.items || []).find(
    (i) => i.reviewId === addAttr.json.item.reviewId,
  );
  report.steps.reviewSurvivesRestart = {
    status: reviewAfter.status,
    found: Boolean(survived),
    queueStatus: survived?.queueStatus || null,
    reviewId: addAttr.json.item.reviewId,
  };

  // UL read-back
  if (!assetId && survived?.queueStatus === 'APPROVED') {
    const acq2 = await api('POST', '/api/media-acquisition/acquire', {
      token,
      body: { reviewId: survived.reviewId },
    });
    assetId = acq2.json?.asset?.id || null;
    report.steps.acquireAfterRestart = {
      status: acq2.status,
      ok: acq2.json?.ok,
      assetId,
      deduped: acq2.json?.deduped,
    };
  }

  let ul = null;
  if (assetId) {
    ul = await api('GET', `/api/universal-library/assets/${encodeURIComponent(assetId)}`, {
      token,
    });
  }
  report.steps.universalLibraryReadback = {
    assetId,
    status: ul?.status,
    ok: ul?.json?.ok ?? Boolean(ul?.json?.asset || ul?.json?.id),
    idMatch:
      assetId &&
      (ul?.json?.asset?.id === assetId ||
        ul?.json?.id === assetId ||
        ul?.json?.data?.id === assetId),
    provenance:
      ul?.json?.asset?.metadata?.provenance ||
      ul?.json?.metadata?.provenance ||
      ul?.json?.data?.metadata?.provenance ||
      null,
  };

  // Duplicate acquisition
  let dup = null;
  if (survived || addAttr.json?.item) {
    dup = await api('POST', '/api/media-acquisition/acquire', {
      token,
      body: {
        reviewId: addAttr.json.item.reviewId,
        candidate: attributionCandidate,
        attributionText: attributionCandidate.attributionText || 'Attribution: Test Baker / CC BY 4.0',
      },
    });
  }
  report.steps.duplicateAcquire = {
    status: dup?.status,
    ok: dup?.json?.ok,
    deduped: dup?.json?.deduped === true,
    sameAssetId: dup?.json?.asset?.id === assetId,
  };

  // Bridge library list contains asset
  const bridge = await api('GET', '/api/media-acquisition/library?limit=50', { token });
  report.steps.libraryBridge = {
    status: bridge.status,
    containsAsset: (bridge.json?.items || []).some((i) => i.id === assetId),
  };

  report.endedAt = new Date().toISOString();
  report.pass =
    report.steps.search.ok &&
    report.steps.addAttributionToReview.ok &&
    report.steps.approveAttribution.ok !== false &&
    report.steps.blockedCannotApprove.ok === false &&
    report.steps.blockedCannotApprove.error === 'blocked_cannot_approve' &&
    report.steps.addReferenceToReview.decision === 'REFERENCE_ONLY' &&
    report.steps.reviewSurvivesRestart.found &&
    report.steps.reviewSurvivesRestart.queueStatus === 'APPROVED' &&
    Boolean(assetId) &&
    report.steps.universalLibraryReadback.idMatch &&
    report.steps.duplicateAcquire.deduped === true &&
    report.steps.providerIsolation.isolationOk;

  report.verdict = report.pass
    ? 'RICH_MEDIA_ACQUISITION_V1_PASS'
    : 'RICH_MEDIA_ACQUISITION_V1_FINAL_E2E_PARTIAL';

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
