#!/usr/bin/env node
/**
 * Wave 1 ΓÇö Store Creation Release Closure canary (staging).
 *
 * Covers:
 *   W1.1 HP Services full chain (intake ΓåÆ build ΓåÆ preview ΓåÆ refresh ΓåÆ publish attempt)
 *   W1.2 Ambiguous / insufficient clarify (no invent)
 *   W1.3 Bounded ~12 fixture cohort matrix
 *
 * Usage:
 *   node scripts/wave1-store-creation-release-canary.mjs
 *   node scripts/wave1-store-creation-release-canary.mjs --skip-publish
 *   node scripts/wave1-store-creation-release-canary.mjs --hp-only
 *
 * Env:
 *   CORE_STAGING_URL, DASHBOARD_STAGING_URL
 *   WAVE1_EVIDENCE_DIR (default docs/reports/evidence)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DASHBOARD = process.env.DASHBOARD_STAGING_URL || 'https://cardbey-dashboard-staging.onrender.com';
const CORE =
  process.env.CORE_STAGING_URL ||
  (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : 'https://cardbey-core-staging.onrender.com');
const SKIP_PUBLISH = process.argv.includes('--skip-publish');
const HP_ONLY = process.argv.includes('--hp-only');
const EVIDENCE_DIR = process.env.WAVE1_EVIDENCE_DIR || join(ROOT, 'docs', 'reports', 'evidence');

const BUILD_POLL_MS = Number(process.env.WAVE1_BUILD_POLL_MS || 180000);

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, json, raw: text.slice(0, 400) };
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow' });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

async function createGuestToken() {
  const { ok, status, json } = await fetchJson(`${CORE}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!ok || !json?.token) {
    return { ok: false, status, error: json?.error || json?.message || 'no token' };
  }
  return { ok: true, token: json.token, userId: json.userId || json.user?.id || null };
}

function authHeaders(guestSession, token) {
  const h = { 'Content-Type': 'application/json', 'X-Guest-Session': guestSession };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function postIntake(message, guestSession, token, extra = {}) {
  return fetchJson(`${CORE}/api/performer/intake/v2`, {
    method: 'POST',
    headers: authHeaders(guestSession, token),
    body: JSON.stringify({
      userMessage: message,
      source: 'wave1_release_canary',
      primaryModeHint: 'store_setup',
      ...extra,
    }),
  });
}

function classifyIntakeAction(json) {
  const action = String(json?.action || '');
  const response = String(json?.response || json?.message || '');
  const lower = response.toLowerCase();
  if (action === 'clarify' || json?.clarifyType || json?.clarificationReason) return 'clarify';
  if (
    lower.includes('what kind of business') ||
    lower.includes('multiple businesses') ||
    lower.includes('which one is yours') ||
    lower.includes('not enough') ||
    lower.includes('tell me more')
  ) {
    return 'clarify';
  }
  if (action === 'store_mission_started') return 'mission_started';
  if (action === 'create_store' || json?.storeCreationDraft) return 'create_path';
  return action || 'unknown';
}

function extractDraftFields(json) {
  const d = json?.storeCreationDraft?.draft || json?.storeCreationDraft || {};
  return {
    storeName: d.name || d.storeName || d.businessName || '',
    website: d.website || d.websiteUrl || '',
    location: d.location || d.city || 'Melbourne',
    category: d.category || d.storeType || 'Other',
  };
}

async function startMission(message, guestSession, token, formOverrides = {}) {
  const intake = await postIntake(message, guestSession, token);
  const fields = { ...extractDraftFields(intake.json), ...formOverrides };
  if (!fields.storeName) {
    // Name-only clue ΓåÆ use message as provisional name when draft empty
    fields.storeName = String(message).replace(/^https?:\/\//i, '').split(/[/?#]/)[0].slice(0, 80) || 'Wave1 Business';
  }
  const start = await postIntake(message, guestSession, token, {
    primaryMode: 'create',
    freshStoreMission: true,
    storeCreateForm: {
      storeName: fields.storeName,
      website: fields.website || undefined,
      location: fields.location || 'Melbourne',
      category: fields.category || 'Other',
    },
    _autoSubmit: true,
  });
  return { intake, start, fields };
}

async function pollBuild(missionId, guestSession, token, maxMs = BUILD_POLL_MS) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < maxMs) {
    const { ok, json } = await fetchJson(`${CORE}/api/missions/${missionId}/state`, {
      headers: authHeaders(guestSession, token),
    });
    last = json;
    if (!ok || !json?.state) {
      await new Promise((r) => setTimeout(r, 3500));
      continue;
    }
    const steps = json.state.steps || [];
    const build = steps.find((s) => String(s.toolName || '').includes('structured_store_build'));
    if (build?.status === 'completed') return { ok: true, state: json.state, elapsed: Date.now() - t0 };
    if (build?.status === 'failed') return { ok: false, failed: true, state: json.state, elapsed: Date.now() - t0 };
    await new Promise((r) => setTimeout(r, 3500));
  }
  return { ok: false, timeout: true, state: last?.state || null, elapsed: Date.now() - t0 };
}

function extractIds(state, startJson) {
  const buildStep = (state?.steps || []).find((s) =>
    String(s.toolName || '').includes('structured_store_build'),
  );
  const draftId =
    state?.outputs?.draftId ||
    buildStep?.output?.draftId ||
    startJson?.draftId ||
    null;
  const generationRunId =
    state?.outputs?.generationRunId ||
    buildStep?.output?.generationRunId ||
    buildStep?.output?.jobId ||
    startJson?.generationRunId ||
    null;
  const storeId =
    state?.outputs?.storeId ||
    buildStep?.output?.storeId ||
    state?.target?.id ||
    null;
  const storeSlug = buildStep?.output?.storeSlug || state?.outputs?.storeSlug || null;
  return { draftId, generationRunId, storeId, storeSlug };
}

async function checkPreview(draftId) {
  const path = `/preview/website/${draftId}`;
  const first = await fetchText(`${DASHBOARD}${path}`);
  const reload = await fetchText(`${DASHBOARD}${path}`);
  const deadEnd = (t) => String(t || '').includes("couldn't reopen the exact store editing session");
  return {
    path: `${DASHBOARD}${path}`,
    reachable: first.ok,
    status: first.status,
    notEditSessionDeadEnd: first.ok && !deadEnd(first.text),
    survivesRefresh: reload.ok && !deadEnd(reload.text),
    reloadStatus: reload.status,
  };
}

async function attemptPublish(draftId, generationRunId, token) {
  if (!token) return { attempted: false, ok: false, reason: 'no_token' };
  const snap = await fetchJson(`${CORE}/api/draft-store/${draftId}/publish-snapshot`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!snap.ok) {
    return {
      attempted: true,
      ok: false,
      stage: 'publish-snapshot',
      status: snap.status,
      error: snap.json?.error || snap.json?.message || snap.raw,
    };
  }
  const sourceFingerprint = snap.json?.sourceFingerprint || snap.json?.snapshot?.sourceFingerprint;
  const snapshotVersion = snap.json?.version ?? snap.json?.snapshotVersion ?? snap.json?.snapshot?.version;
  if (!sourceFingerprint || snapshotVersion == null) {
    return {
      attempted: true,
      ok: false,
      stage: 'publish-snapshot-fields',
      status: snap.status,
      error: 'missing fingerprint/version',
      snapKeys: Object.keys(snap.json || {}),
    };
  }
  const pub = await fetchJson(`${CORE}/api/draft-store/${draftId}/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expectedSourceFingerprint: sourceFingerprint,
      expectedSnapshotVersion: snapshotVersion,
      expectedDraftId: draftId,
      expectedGenerationRunId: generationRunId || undefined,
    }),
  });
  const liveUrl =
    pub.json?.liveUrl ||
    pub.json?.url ||
    pub.json?.storeUrl ||
    (pub.json?.slug ? `${DASHBOARD}/s/${pub.json.slug}` : null) ||
    (pub.json?.store?.slug ? `${DASHBOARD}/s/${pub.json.store.slug}` : null);
  let liveOk = null;
  let publicApiStatus = null;
  if (pub.ok) {
    const slug =
      pub.json?.slug ||
      pub.json?.store?.slug ||
      (typeof liveUrl === 'string' && liveUrl.includes('/s/') ? liveUrl.split('/s/')[1]?.split(/[?#]/)[0] : null);
    if (slug) {
      const publicApi = await fetchJson(`${CORE}/api/public/stores/${encodeURIComponent(slug)}`);
      publicApiStatus = publicApi.status;
      liveOk = publicApi.ok;
      if (!liveUrl) liveUrl = `${DASHBOARD}/s/${slug}`;
    } else if (liveUrl) {
      // Fallback: SPA shell always 200 — do not treat as public truth.
      const live = await fetchText(liveUrl.startsWith('http') ? liveUrl : `${DASHBOARD}${liveUrl}`);
      liveOk = live.ok;
      publicApiStatus = 'spa_only_unchecked';
    }
  }
  return {
    attempted: true,
    ok: pub.ok,
    status: pub.status,
    error: pub.json?.error || pub.json?.message || (!pub.ok ? pub.raw : null),
    liveUrl,
    liveOk,
    publicApiStatus,
    storeId: pub.json?.storeId || pub.json?.committedStoreId || null,
    slug: pub.json?.slug || null,
    publishSource: pub.json?.publishSource || null,
  };
}

async function runFullChain({ id, input, formOverrides = {}, doPublish = false, guestSession, token }) {
  const started = Date.now();
  const row = {
    id,
    input,
    depth: 'full',
    intakeAction: null,
    missionId: null,
    build: null,
    draftId: null,
    generationRunId: null,
    preview: null,
    publish: null,
    recovered: false,
    failure: null,
    elapsedMs: 0,
    pass: false,
  };
  try {
    const { intake, start, fields } = await startMission(input, guestSession, token, formOverrides);
    row.intakeAction = classifyIntakeAction(intake.json);
    row.missionId = start.json?.missionId || null;
    row.startAction = start.json?.action || null;
    row.fields = fields;

    if (start.json?.action !== 'store_mission_started' || !row.missionId) {
      row.failure = `mission_not_started:${start.json?.action || start.status}:${start.json?.error || start.json?.message || ''}`;
      row.elapsedMs = Date.now() - started;
      return row;
    }

    const poll = await pollBuild(row.missionId, guestSession, token);
    row.build = poll.ok ? 'completed' : poll.failed ? 'failed' : 'timeout';
    if (!poll.ok) {
      row.failure = `build_${row.build}`;
      row.elapsedMs = Date.now() - started;
      return row;
    }

    const ids = extractIds(poll.state, start.json);
    row.draftId = ids.draftId;
    row.generationRunId = ids.generationRunId;
    row.storeId = ids.storeId;
    row.storeSlug = ids.storeSlug;

    if (!row.draftId) {
      row.failure = 'no_draftId';
      row.elapsedMs = Date.now() - started;
      return row;
    }

    row.preview = await checkPreview(row.draftId);
    if (!row.preview.reachable || !row.preview.survivesRefresh) {
      row.failure = 'preview_refresh_failed';
      row.elapsedMs = Date.now() - started;
      return row;
    }

    if (doPublish && !SKIP_PUBLISH) {
      row.publish = await attemptPublish(row.draftId, row.generationRunId, token);
      if (!row.publish.ok) {
        row.failure = `publish:${row.publish.error || row.publish.status}`;
        row.pass = true;
        row.passNote = 'build_preview_pass_publish_blocked';
        row.elapsedMs = Date.now() - started;
        return row;
      }
      if (row.publish.liveOk === false) {
        row.failure = `publish_ok_but_public_404:${row.publish.publicApiStatus}`;
        row.pass = true;
        row.passNote = 'publish_api_ok_public_not_eligible';
        row.elapsedMs = Date.now() - started;
        return row;
      }
    }

    row.pass = true;
    row.elapsedMs = Date.now() - started;
    return row;
  } catch (e) {
    row.failure = e?.message || String(e);
    row.elapsedMs = Date.now() - started;
    return row;
  }
}

async function runClarify({ id, input, guestSession, token, expect }) {
  const started = Date.now();
  const intake = await postIntake(input, guestSession, token);
  const action = classifyIntakeAction(intake.json);
  const response = String(intake.json?.response || intake.json?.message || '');
  const invented =
    /here is your (catalog|menu|price)|we created \d+ (products|services)/i.test(response) ||
    Boolean(intake.json?.catalogItems?.length > 0 && action === 'clarify');

  let pass = false;
  if (expect === 'clarify') {
    pass = action === 'clarify' && !invented;
  } else if (expect === 'clarify_or_sparse') {
    // Ambiguous/insufficient must ASK_USER or fail-closed ΓÇö not "Ready to create" as complete identity.
    const claimsComplete = /everything looks complete|ready to create your store/i.test(response);
    pass =
      !invented &&
      (action === 'clarify' ||
        (action === 'create_path' && !claimsComplete && Boolean(intake.json?.missingFields?.length)));
  }

  return {
    id,
    input,
    depth: 'clarify',
    intakeAction: action,
    httpStatus: intake.status,
    responsePreview: response.slice(0, 220),
    invented,
    pass,
    failure: pass ? null : `expected_${expect}_got_${action}${invented ? '_invented' : ''}`,
    elapsedMs: Date.now() - started,
  };
}

async function runCreatePathOnly({ id, input, guestSession, token }) {
  const started = Date.now();
  const intake = await postIntake(input, guestSession, token);
  const action = classifyIntakeAction(intake.json);
  const pass = action === 'create_path' || action === 'mission_started' || action === 'clarify';
  return {
    id,
    input,
    depth: 'intake',
    intakeAction: action,
    httpStatus: intake.status,
    responsePreview: String(intake.json?.response || '').slice(0, 220),
    pass: pass && intake.ok,
    failure: pass && intake.ok ? null : `intake_${action}_${intake.status}`,
    elapsedMs: Date.now() - started,
  };
}

const COHORT = [
  {
    id: 'hp-services',
    input: 'HP Services',
    kind: 'full',
    doPublish: true,
    formOverrides: { storeName: 'HP Services', location: 'Melbourne', category: 'Home & garden' },
  },
  {
    id: 'msd-url',
    input: 'modernsecuritydoors.com.au',
    kind: 'full',
    doPublish: false,
    formOverrides: {
      storeName: 'Modern Security Doors',
      website: 'https://www.modernsecuritydoors.com.au',
      location: 'Melbourne',
      category: 'Home & garden',
    },
  },
  { id: 'desc-coffee', input: 'Coffee shop in Melbourne', kind: 'intake' },
  { id: 'insufficient', input: 'Help me start something.', kind: 'clarify', expect: 'clarify' },
  { id: 'flower-store', input: 'Flower Store', kind: 'clarify', expect: 'clarify_or_sparse' },
  { id: 'spotless', input: 'Spotless Cleaning Services', kind: 'clarify', expect: 'clarify_or_sparse' },
  { id: 'abc-plumbing', input: 'ABC Plumbing', kind: 'clarify', expect: 'clarify_or_sparse' },
  {
    id: 'market-lane',
    input: 'https://www.marketlane.com.au',
    kind: 'full',
    doPublish: false,
    formOverrides: {
      storeName: 'Market Lane Coffee',
      website: 'https://www.marketlane.com.au',
      location: 'Melbourne',
      category: 'Cafe',
    },
  },
  { id: 'anison', input: 'Anison Capital', kind: 'clarify', expect: 'clarify_or_sparse' },
  { id: 'handyman-melb', input: 'Handyman in Melbourne', kind: 'intake' },
  {
    id: 'jims-mowing',
    input: 'https://jimsmowing.com.au',
    kind: 'intake',
  },
  { id: 'ca-handy', input: 'CA Handy Man Melbourne', kind: 'clarify', expect: 'clarify_or_sparse' },
];

async function main() {
  console.log('Wave 1 ΓÇö Store Creation Release Closure canary');
  console.log(`Core: ${CORE}`);
  console.log(`Dashboard: ${DASHBOARD}`);
  console.log(`Skip publish: ${SKIP_PUBLISH}  HP-only: ${HP_ONLY}\n`);

  const health = await fetchJson(`${CORE}/api/health`);
  if (!(health.json?.ok || health.json?.status === 'ok')) {
    console.error('Core staging unhealthy', health.status, health.raw);
    process.exit(1);
  }
  console.log(`[PASS] Core health ΓÇö ${health.json?.env || 'ok'}`);

  const guest = await createGuestToken();
  if (!guest.ok) {
    console.error('Guest auth failed', guest);
    process.exit(1);
  }
  console.log('[PASS] Guest auth token acquired');

  const guestSession = `wave1-${Date.now()}`;
  const fixtures = HP_ONLY ? COHORT.filter((c) => c.id === 'hp-services') : COHORT;
  const results = [];

  for (const fx of fixtures) {
    process.stdout.write(`\nΓåÆ ${fx.id} (${fx.kind}) ΓÇª `);
    let row;
    if (fx.kind === 'full') {
      row = await runFullChain({
        id: fx.id,
        input: fx.input,
        formOverrides: fx.formOverrides || {},
        doPublish: Boolean(fx.doPublish),
        guestSession: `${guestSession}-${fx.id}`,
        token: guest.token,
      });
    } else if (fx.kind === 'clarify') {
      row = await runClarify({
        id: fx.id,
        input: fx.input,
        guestSession: `${guestSession}-${fx.id}`,
        token: guest.token,
        expect: fx.expect || 'clarify',
      });
    } else {
      row = await runCreatePathOnly({
        id: fx.id,
        input: fx.input,
        guestSession: `${guestSession}-${fx.id}`,
        token: guest.token,
      });
    }
    results.push(row);
    console.log(row.pass ? `PASS (${row.elapsedMs}ms)` : `FAIL ${row.failure || ''} (${row.elapsedMs}ms)`);
    if (row.preview?.path) console.log(`  preview: ${row.preview.path}`);
    if (row.publish?.attempted) {
      console.log(
        `  publish: ${row.publish.ok ? 'PASS' : 'BLOCKED'} ${row.publish.error || row.publish.liveUrl || ''}`,
      );
    }
    if (row.responsePreview) console.log(`  response: ${row.responsePreview.slice(0, 120)}`);
  }

  const hp = results.find((r) => r.id === 'hp-services');
  const clarifyRows = results.filter((r) => COHORT.find((c) => c.id === r.id)?.kind === 'clarify');
  const inventCount = clarifyRows.filter((r) => r.invented).length;
  const clarifyPass = clarifyRows.every((r) => r.pass) && inventCount === 0;

  const summary = {
    at: new Date().toISOString(),
    core: CORE,
    dashboard: DASHBOARD,
    verdicts: {
      W1_1_HP_SERVICES: hp?.pass
        ? hp.publish?.ok && hp.publish?.liveOk
          ? 'PASS_FULL_INCLUDING_PUBLISH_PUBLIC'
          : hp.passNote === 'publish_api_ok_public_not_eligible'
            ? 'PASS_PUBLISH_API_PUBLIC_GUEST_BLOCKED'
            : hp.passNote === 'build_preview_pass_publish_blocked'
              ? 'PASS_BUILD_PREVIEW_PUBLISH_BLOCKED'
              : hp.publish?.ok
                ? 'PASS_PUBLISH_API'
                : 'PASS_BUILD_PREVIEW'
        : 'FAIL',
      W1_2_CLARIFY_NO_INVENT: clarifyPass ? 'PASS' : 'FAIL',
      W1_3_COHORT: results.every((r) => r.pass) ? 'PASS' : 'PARTIAL',
    },
    counts: {
      total: results.length,
      pass: results.filter((r) => r.pass).length,
      fail: results.filter((r) => !r.pass).length,
      inventOnClarify: inventCount,
    },
    results,
  };

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const outPath = join(EVIDENCE_DIR, `wave1-store-creation-canary-${stamp()}.json`);
  writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`\nEvidence: ${outPath}`);
  console.log('Verdicts:', summary.verdicts);
  console.log(`Cohort: ${summary.counts.pass}/${summary.counts.total} pass`);

  const hardFail =
    summary.verdicts.W1_1_HP_SERVICES === 'FAIL' || summary.verdicts.W1_2_CLARIFY_NO_INVENT === 'FAIL';
  process.exit(hardFail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
