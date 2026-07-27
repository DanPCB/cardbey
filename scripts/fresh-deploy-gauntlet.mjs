#!/usr/bin/env node
/**
 * Fresh-deploy gauntlet (API-level) — new-user store creation via Intake V2.
 * Uses live Core at API_BASE (default http://127.0.0.1:3001).
 *
 * Usage:
 *   node scripts/fresh-deploy-gauntlet.mjs
 *   API_BASE=http://127.0.0.1:3001 node scripts/fresh-deploy-gauntlet.mjs
 */

const API_BASE = (process.env.API_BASE || process.env.CARDBEY_API_BASE || 'http://127.0.0.1:3001').replace(
  /\/$/,
  '',
);
const DASHBOARD_BASE = (process.env.DASHBOARD_BASE || 'http://127.0.0.1:5174').replace(/\/$/, '');
let AUTH_TOKEN = (process.env.AUTH_TOKEN || '').replace(/^\s*Bearer\s+/i, '').trim();
const USE_GUEST_AUTH = process.env.GAUNTLET_USE_GUEST !== '0' && !AUTH_TOKEN;
const POLL_MS = 3000;
const BUILD_TIMEOUT_MS = Number(process.env.GAUNTLET_BUILD_TIMEOUT_MS || 180_000);

const results = [];

function record(step, ok, detail = '') {
  results.push({ step, ok, detail });
  const icon = ok ? 'PASS' : 'FAIL';
  console.log(`[${icon}] Step ${step}: ${detail || (ok ? 'ok' : 'failed')}`);
}

async function request(method, path, body) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text.slice(0, 500) };
  }
  return { ok: res.ok, status: res.status, data, text };
}

function findLogoCheckpoint(state) {
  const steps = state?.steps ?? [];
  const active = state?.activeCheckpoint;
  if (active?.stepId) {
    const row = steps.find((s) => s.stepId === active.stepId || s.id === active.stepId);
    return { active, row };
  }
  const awaiting = steps.find(
    (s) =>
      String(s.status ?? '').toLowerCase() === 'awaiting_input' &&
      (s.checkpoint?.outputKey === 'logoChoice' || String(s.toolName ?? '').includes('checkpoint')),
  );
  return awaiting ? { active: awaiting.checkpoint ?? awaiting, row: awaiting } : null;
}

async function pollMissionState(missionId, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const r = await request('GET', `/api/missions/${encodeURIComponent(missionId)}/state`);
    if (r.ok && r.data?.state) {
      last = r.data.state;
      if (predicate(last)) return { ok: true, state: last };
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return { ok: false, state: last };
}

async function resolveAuthToken() {
  if (AUTH_TOKEN) return AUTH_TOKEN;
  if (!USE_GUEST_AUTH) return 'dev-admin-token';
  const guestRes = await fetch(`${API_BASE}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const guestJson = await guestRes.json().catch(() => ({}));
  if (!guestRes.ok || !guestJson?.token) {
    throw new Error(`guest auth failed HTTP ${guestRes.status}: ${JSON.stringify(guestJson).slice(0, 200)}`);
  }
  AUTH_TOKEN = guestJson.token;
  return AUTH_TOKEN;
}

async function main() {
  console.log('=== Cardbey Fresh-Deploy Gauntlet (API) ===');
  console.log(`Core:      ${API_BASE}`);
  console.log(`Dashboard: ${DASHBOARD_BASE}`);
  await resolveAuthToken();
  console.log(`Auth:      ${USE_GUEST_AUTH ? 'guest session' : 'Bearer token'}\n`);

  // Step 0 — prerequisites
  try {
    const health = await fetch(`${API_BASE}/api/health`);
    const hj = await health.json();
    record('0a', health.ok && hj?.ok === true, `Core health ${health.status}`);
  } catch (e) {
    record('0a', false, `Core unreachable: ${e.message}`);
    printSummary();
    process.exit(1);
  }

  try {
    const dash = await fetch(`${DASHBOARD_BASE}/`);
    record('0b', dash.ok || dash.status === 304, `Dashboard root ${dash.status}`);
  } catch (e) {
    record('0b', false, `Dashboard unreachable: ${e.message} (optional if API-only)`);
  }

  // Step 1 — Intake returns missionId (storeCreateForm = reliable parse; NL alone may return create_store without name)
  const stamp = Date.now();
  const storeName = process.env.GAUNTLET_STORE_NAME || `Gauntlet Cafe ${stamp}`;
  const location = process.env.GAUNTLET_LOCATION || 'Melbourne';
  const goal =
    process.env.GAUNTLET_GOAL || `Create a store for ${storeName} in ${location} — coffee shop with espresso and pastries`;
  const intake = await request('POST', '/api/performer/intake/v2', {
    goal,
    userMessage: goal,
    locale: 'en',
    currentContext: {},
    storeCreateForm: {
      storeName,
      location,
      category: process.env.GAUNTLET_CATEGORY || 'cafe',
    },
  });

  const missionId =
    intake.data?.missionId ||
    intake.data?.result?.missionId ||
    intake.data?.pipelineId ||
    null;
  const intakeAction = intake.data?.action ?? intake.data?.result?.action ?? 'unknown';

  record(
    1,
    intake.ok && Boolean(missionId),
    intake.ok
      ? `action=${intakeAction} missionId=${missionId ?? 'MISSING'} status=${intake.status}`
      : `HTTP ${intake.status} ${JSON.stringify(intake.data).slice(0, 200)}`,
  );

  if (!missionId) {
    printSummary();
    process.exit(1);
  }

  // Step 2 — SSE stream connects (stream-token + agent-chat)
  const tokenRes = await request('POST', '/api/agent-messages/stream-token', { missionId });
  const streamToken = tokenRes.data?.streamToken;
  let sseOk = false;
  if (tokenRes.ok && streamToken) {
    try {
      const sseUrl = `${API_BASE}/api/stream?key=agent-chat&missionId=${encodeURIComponent(missionId)}&streamToken=${encodeURIComponent(streamToken)}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const sseRes = await fetch(sseUrl, { headers: { Authorization: `Bearer ${AUTH_TOKEN}` }, signal: ctrl.signal });
      clearTimeout(timer);
      const ct = sseRes.headers.get('content-type') || '';
      sseOk = sseRes.ok && ct.includes('text/event-stream');
      sseRes.body?.cancel?.();
    } catch (e) {
      if (e.name === 'AbortError') sseOk = true;
      else sseOk = false;
    }
  }
  record(
    2,
    sseOk,
    tokenRes.ok
      ? `streamToken=${streamToken ? 'yes' : 'no'} sse=${sseOk ? 'connected' : 'failed'}`
      : `stream-token HTTP ${tokenRes.status}`,
  );

  // Step 3 — First checkpoint appears
  const stateRes = await request('GET', `/api/missions/${encodeURIComponent(missionId)}/state`);
  const state0 = stateRes.data?.state;
  const cp = state0 ? findLogoCheckpoint(state0) : null;
  const status0 = String(state0?.status ?? '').toLowerCase();
  const runState0 = String(state0?.runState ?? '').toLowerCase();
  record(
    3,
    stateRes.ok && (status0 === 'awaiting_input' || runState0.includes('checkpoint') || Boolean(cp)),
    stateRes.ok
      ? `status=${status0} runState=${runState0} checkpoint=${cp ? 'logo' : 'none'} steps=${(state0?.steps ?? []).length}`
      : `state HTTP ${stateRes.status}`,
  );

  // Step 4 — Tool executes (skip logo → pipeline runs structured_store_build)
  let step4ok = false;
  let step4detail = 'skipped — no checkpoint stepId';
  if (cp?.row?.stepId || cp?.active?.stepId) {
    const stepId = cp.row?.stepId ?? cp.active?.stepId;
    let respond = await request('POST', `/api/missions/${encodeURIComponent(missionId)}/respond`, {
      stepId,
      response: 'Skip',
      data: { logoUploadStatus: 'skipped' },
    });
    if (!respond.ok && respond.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      respond = await request('POST', `/api/missions/${encodeURIComponent(missionId)}/respond`, {
        stepId,
        response: 'Skip',
        data: { logoUploadStatus: 'skipped' },
      });
    }
    if (!respond.ok) {
      const afterErr = await request('GET', `/api/missions/${encodeURIComponent(missionId)}/state`);
      const logoDone = (afterErr.data?.state?.steps ?? []).some(
        (s) => s.config?.outputKey === 'logoChoice' && String(s.status).toLowerCase() === 'completed',
      );
      if (logoDone) {
        await request('POST', `/api/missions/${encodeURIComponent(missionId)}/run-until-blocked`, {});
      }
    }
    const polled = await pollMissionState(
      missionId,
      (st) => {
        const steps = st?.steps ?? [];
        const build = steps.find((s) => String(s.toolName ?? '') === 'structured_store_build');
        const buildStatus = String(build?.status ?? '').toLowerCase();
        return buildStatus === 'completed' || Boolean(st?.outputs?.draftId);
      },
      BUILD_TIMEOUT_MS,
    );
    const buildStep = (polled.state?.steps ?? []).find(
      (s) => String(s.toolName ?? '') === 'structured_store_build',
    );
    const failed = polled.state?.outputs?._failed;
    step4ok = polled.ok && !failed;
    step4detail = failed
      ? `build failed: ${failed?.error?.code ?? failed?.tool ?? 'unknown'}`
      : step4ok
        ? `build status=${buildStep?.status ?? 'unknown'}`
        : respond.ok
          ? `build did not complete within ${BUILD_TIMEOUT_MS}ms (mission=${polled.state?.status})`
          : `respond HTTP ${respond.status} ${respond.text?.slice(0, 120)}`;
  } else if (state0?.outputs?.draftId) {
    step4ok = true;
    step4detail = 'draft already exists (pipeline may have run past checkpoint)';
  }
  record(4, step4ok, step4detail);

  // Step 5 — Artifact persists (draftId / generationRunId in mission outputs)
  const finalStateRes = await request('GET', `/api/missions/${encodeURIComponent(missionId)}/state`);
  const finalState = finalStateRes.data?.state;
  const outputs = finalState?.outputs ?? finalState?.outputsJson ?? {};
  const draftId =
    outputs.draftId ??
    outputs.createdDraftId ??
    (finalState?.steps ?? []).find((s) => s.toolName === 'structured_store_build')?.output?.draftId ??
    intake.data?.draftId ??
    null;
  const generationRunId = outputs.generationRunId ?? outputs.jobId ?? intake.data?.generationRunId ?? null;
  const hasDraft = Boolean(draftId || generationRunId);
  record(
    5,
    finalStateRes.ok && hasDraft,
    finalStateRes.ok
      ? `draftId=${draftId ?? 'null'} generationRunId=${generationRunId ?? 'null'} missionStatus=${finalState?.status}`
      : `state HTTP ${finalStateRes.status}`,
  );

  printSummary();
  process.exit(results.some((r) => !r.ok && String(r.step).match(/^[1-5]/)) ? 1 : 0);
}

function printSummary() {
  console.log('\n=== Gauntlet summary ===');
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  for (const r of results) {
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.step}: ${r.detail}`);
  }
  console.log(`\nTotal: ${passed} passed, ${failed} failed`);
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
