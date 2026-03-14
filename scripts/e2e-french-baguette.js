#!/usr/bin/env node
/**
 * E2E Store Creation: "French Baguette" smoke runner
 *
 * Contract: docs/E2E_STORE_CREATION_CONTRACT.md
 * Steps 1–6; this script runs API-level smoke for Steps 1–2 (create store + job completion).
 * Steps 3–6 (preview, publish, frontscreen, Smart Object/loyalty) can be run manually or
 * with AUTH_TOKEN for publish (see README / contract).
 *
 * Uses polling (no eventsource dependency). Node 18+ for native fetch.
 *
 * Usage:
 *   node scripts/e2e-french-baguette.js
 *   BASE_URL=http://localhost:3001 node scripts/e2e-french-baguette.js
 *   AUTH_TOKEN=<jwt> BASE_URL=http://localhost:3001 node scripts/e2e-french-baguette.js
 *
 * With AUTH_TOKEN: creates job (Step 1), polls to completion (Step 2), then optionally
 * fetches draft (Step 3 prep). Without AUTH_TOKEN: health check only and exits with
 * instructions.
 */

const BASE_URL = process.env.BASE_URL || process.env.API_BASE || 'http://localhost:3001';
const AUTH_TOKEN = process.env.AUTH_TOKEN || process.env.TOKEN;
const TIMEOUT_MS = 180000; // 3 minutes for job completion
const POLL_INTERVAL_MS = 4000;

console.log('[E2E French Baguette] BASE_URL:', BASE_URL);
console.log('[E2E French Baguette] AUTH_TOKEN:', AUTH_TOKEN ? 'set' : 'not set (health-only mode)\n');

async function main() {
  // Health check
  let healthRes;
  try {
    healthRes = await fetch(`${BASE_URL}/api/health`, { method: 'GET' });
  } catch (e) {
    console.error('[FAIL] Cannot reach API:', e.message);
    process.exit(1);
  }
  if (!healthRes.ok) {
    console.error('[FAIL] Health check failed:', healthRes.status, healthRes.statusText);
    process.exit(1);
  }
  console.log('[OK] Health check passed\n');

  if (!AUTH_TOKEN) {
    console.log('Full E2E (Steps 1–6) requires AUTH_TOKEN. Run:');
    console.log('  AUTH_TOKEN=<your-jwt> BASE_URL=' + BASE_URL + ' node scripts/e2e-french-baguette.js');
    console.log('Manual checklist: docs/E2E_STORE_CREATION_CONTRACT.md');
    process.exit(0);
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${AUTH_TOKEN}`,
  };

  // Step 1: Create store (French Baguette)
  console.log('[1/3] Creating store job (French Baguette café)...');
  const startRes = await fetch(`${BASE_URL}/api/mi/orchestra/start`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      goal: 'build_store',
      rawInput: 'French Baguette café – coffee shop with coffee product',
      inputsJson: {
        storeName: 'French Baguette',
        businessTypeHint: 'cafe',
      },
    }),
  });

  if (startRes.status >= 500) {
    console.error('[FAIL] Server error:', startRes.status, await startRes.text());
    process.exit(1);
  }
  if (!startRes.ok) {
    console.error('[FAIL] Job creation failed:', startRes.status, await startRes.text());
    process.exit(1);
  }

  const startData = await startRes.json();
  if (!startData.ok || !startData.jobId) {
    console.error('[FAIL] Invalid response:', startData);
    process.exit(1);
  }
  const jobId = startData.jobId;
  console.log('[OK] Job created:', jobId);

  // Step 2: Poll job status until COMPLETED or FAILED
  console.log('[2/3] Waiting for job completion (polling)...');
  const deadline = Date.now() + TIMEOUT_MS;
  let completed = null;

  while (Date.now() < deadline) {
    const statusRes = await fetch(`${BASE_URL}/api/mi/orchestra/job/${jobId}`, { headers });
    if (!statusRes.ok) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }
    const statusData = await statusRes.json();
    const job = statusData?.job;
    const status = job?.status;
    if (status === 'COMPLETED') {
      completed = job;
      break;
    }
    if (status === 'FAILED') {
      console.error('[FAIL] Job failed:', job?.lastError || job?.message || 'Unknown error');
      process.exit(1);
    }
    if (job?.progressPct != null) {
      console.log('  Progress:', job.progressPct + '%');
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (!completed) {
    console.error('[FAIL] Timeout waiting for job completion after', TIMEOUT_MS, 'ms');
    process.exit(1);
  }
  console.log('[OK] Job completed');

  // Step 3 prep: fetch draft (generationRunId from job)
  const generationRunId = completed?.generationRunId || completed?.inputsJson?.generationRunId || jobId;
  console.log('[3/3] Fetching draft (generationRunId:', generationRunId, ')...');
  const draftRes = await fetch(
    `${BASE_URL}/api/stores/temp/draft?generationRunId=${encodeURIComponent(generationRunId)}`,
    { headers }
  );
  if (draftRes.ok) {
    const draftData = await draftRes.json();
    const status = draftData?.draft?.status ?? draftData?.status;
    console.log('[OK] Draft status:', status);
  } else {
    console.warn('[WARN] Draft fetch failed:', draftRes.status, '(continue with manual Steps 3–6)');
  }

  console.log('\n[SUCCESS] E2E smoke (Steps 1–2) passed. Steps 3–6: see docs/E2E_STORE_CREATION_CONTRACT.md');
  process.exit(0);
}

main().catch((err) => {
  console.error('[FAIL]', err.message);
  process.exit(1);
});
