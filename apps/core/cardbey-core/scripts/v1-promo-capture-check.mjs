#!/usr/bin/env node
/**
 * V1 promo capture pre-flight — verifies staging can support the Golden Path recording.
 *
 * Canonical copy for cardbey-core-staging (Render rootDir = apps/core/cardbey-core).
 * Monorepo mirror: ../../../../scripts/v1-promo-capture-check.mjs
 *
 * Usage (Render shell — cwd is apps/core/cardbey-core):
 *   node scripts/v1-promo-capture-check.mjs
 *   node scripts/v1-promo-capture-check.mjs --full
 *
 * Usage (local monorepo root):
 *   node scripts/v1-promo-capture-check.mjs --full
 */
const DASHBOARD = process.env.DASHBOARD_STAGING_URL || 'https://cardbey-dashboard-staging.onrender.com';
const CORE =
  process.env.CORE_STAGING_URL ||
  (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : 'https://cardbey-core-staging.onrender.com');
const FULL = process.argv.includes('--full');
const CAPTURE_BUSINESS = process.env.PROMO_CAPTURE_BUSINESS || 'market_lane';

function check(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow' });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, json: JSON.parse(text), raw: text };
  } catch {
    return { ok: res.ok, status: res.status, json: null, raw: text.slice(0, 200) };
  }
}

function extractScriptSrcs(html, base) {
  const srcs = [];
  const re = /<script[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    srcs.push(href.startsWith('http') ? href : new URL(href, base).href);
  }
  return srcs;
}

async function postIntake(message, guestSession, extra = {}) {
  return fetchJson(`${CORE}/api/performer/intake/v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Guest-Session': guestSession,
    },
    body: JSON.stringify({
      userMessage: message,
      source: 'v1_promo_capture_check',
      primaryModeHint: 'store_setup',
      ...extra,
    }),
  });
}

async function pollMissionState(missionId, guestSession, maxMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { ok, json } = await fetchJson(`${CORE}/api/missions/${missionId}/state`, {
      headers: { 'X-Guest-Session': guestSession },
    });
    if (!ok || !json?.state) {
      await new Promise((r) => setTimeout(r, 4000));
      continue;
    }
    const steps = json.state.steps || [];
    const build = steps.find((s) => String(s.toolName || '').includes('structured_store_build'));
    if (build?.status === 'completed') {
      return { ok: true, state: json.state, elapsed: Date.now() - start };
    }
    if (build?.status === 'failed') {
      return { ok: false, failed: true, state: json.state, elapsed: Date.now() - start };
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  return { ok: false, timeout: true, elapsed: Date.now() - start };
}

async function fetchDraft(generationRunId, guestSession) {
  const q = new URLSearchParams({ generationRunId });
  return fetchJson(`${CORE}/api/stores/temp/draft?${q}`, {
    headers: { 'X-Guest-Session': guestSession },
  });
}

function catalogStats(draftJson) {
  const items = draftJson?.catalog?.items || draftJson?.draft?.catalog?.items || [];
  const sources = [...new Set(items.map((i) => i.catalogSource).filter(Boolean))];
  const templateCount = items.filter((i) =>
    String(i.catalogSource || '').toUpperCase().includes('TEMPLATE'),
  ).length;
  return { count: items.length, sources, templateCount };
}

async function main() {
  console.log('V1 Promo Capture Pre-flight');
  console.log(`Dashboard: ${DASHBOARD}`);
  console.log(`Core: ${CORE}`);
  console.log(`Mode: ${FULL ? 'full (mission poll)' : 'quick (surface + intake)'}\n`);

  let allPass = true;

  const home = await fetchText(`${DASHBOARD}/`);
  allPass = check('Dashboard homepage reachable', home.ok && home.text.length > 500, `HTTP ${home.status}`) && allPass;

  let bundleText = home.text;
  for (const url of extractScriptSrcs(home.text, DASHBOARD).slice(0, 12)) {
    try {
      const chunk = await fetchText(url);
      if (chunk.ok) bundleText += '\n' + chunk.text;
    } catch {
      /* optional chunk */
    }
  }

  allPass =
    check('Create Your Business in bundle', bundleText.includes('Create Your Business')) && allPass;
  allPass =
    check(
      'Canonical create-store entry in bundle',
      bundleText.includes('newStore') &&
        bundleText.includes('starter=create_store') &&
        bundleText.includes('entry=performer'),
    ) && allPass;
  check(
    'Promo progress copy in bundle (optional — after dashboard deploy)',
    bundleText.includes('Understanding your business'),
    bundleText.includes('Understanding your business') ? 'present' : 'not yet in staging bundle',
  );

  const health = await fetchJson(`${CORE}/api/health`);
  const coreUp = health.json?.status === 'ok' || health.json?.healthy === true;
  allPass = check('Core staging health', coreUp, coreUp ? '' : `HTTP ${health.status} ${health.raw}`) && allPass;

  if (!coreUp) {
    console.log('\n---');
    console.log('VERDICT: V1_PROMO_CAPTURE_BLOCKED — core staging unavailable');
    process.exit(1);
  }

  const ver = await fetchJson(`${CORE}/api/runtime/version`);
  console.log(`Core deploy SHA: ${String(ver.json?.commitSha || '').slice(0, 12)}\n`);

  const guest = `v1-promo-${Date.now()}`;

  const msd = await postIntake('modernsecuritydoors.com.au', guest);
  allPass = check('URL intake HTTP 200', msd.status === 200, `status=${msd.status}`) && allPass;
  allPass =
    check('URL intake → create_store', msd.json?.action === 'create_store', msd.json?.action) && allPass;
  const msdMissing = msd.json?.missingFields || msd.json?.storeCreationDraft?.missingFields || [];
  allPass =
    check('URL intake not blocked on location', !msdMissing.includes('location'), JSON.stringify(msdMissing)) &&
    allPass;

  const desc = await postIntake(
    'I run a packaging factory in Vietnam and want customers in Australia.',
    guest,
  );
  allPass = check('Description intake HTTP 200', desc.status === 200) && allPass;
  allPass =
    check('Description intake → create_store', desc.json?.action === 'create_store', desc.json?.action) &&
    allPass;

  if (FULL) {
    const guestFull = `v1-promo-full-${Date.now()}`;
    const intakeBody =
      CAPTURE_BUSINESS === 'modern_security_doors'
        ? {
            userMessage: 'modernsecuritydoors.com.au',
            primaryMode: 'create',
            freshStoreMission: true,
            action: 'create_store',
          }
        : {
            userMessage: 'Create my business',
            primaryMode: 'create',
            freshStoreMission: true,
            storeCreateForm: {
              storeName: 'Market Lane Coffee',
              website: 'https://www.marketlane.com.au',
              location: 'Melbourne',
              category: 'Food & Beverage',
            },
          };

    const start = await fetchJson(`${CORE}/api/performer/intake/v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Guest-Session': guestFull,
      },
      body: JSON.stringify({ ...intakeBody, source: 'v1_promo_capture_check' }),
    });

    allPass =
      check(
        'Store mission started',
        start.json?.action === 'store_mission_started',
        start.json?.action,
      ) && allPass;

    const missionId = start.json?.missionId;
    const genRunId =
      start.json?.generationRunId ||
      start.json?.data?.generationRunId ||
      start.json?.storeCreationDraft?.generationRunId;

    if (missionId) {
      const poll = await pollMissionState(missionId, guestFull);
      allPass =
        check(
          'structured_store_build completed',
          poll.ok,
          poll.failed ? 'failed' : poll.timeout ? 'timeout' : `${poll.elapsed}ms`,
        ) && allPass;
      const resolvedGen = genRunId || poll.state?.generationRunId || poll.state?.metadata?.generationRunId;
      if (resolvedGen) {
        const draft = await fetchDraft(resolvedGen, guestFull);
        const stats = catalogStats(draft.json);
        allPass =
          check(
            'Draft available',
            draft.json?.status === 'ready' || draft.json?.draft?.status === 'ready',
            draft.json?.status,
          ) && allPass;
        allPass = check('Research offerings present', stats.count >= 8, `count=${stats.count}`) && allPass;
        allPass =
          check('No template catalog fallback', stats.templateCount === 0, `template=${stats.templateCount}`) &&
          allPass;
        allPass =
          check(
            'catalogSource includes research',
            stats.sources.some((s) => String(s).toLowerCase() === 'research'),
            stats.sources.join(','),
          ) && allPass;
      }
    }
  } else {
    console.log('\n[SKIP] Full mission poll (pass --full to verify draft/research end-to-end)');
  }

  console.log('\n---');
  if (allPass) {
    console.log('VERDICT: V1_PROMO_CAPTURE_PREFLIGHT_PASS');
    process.exit(0);
  }
  console.log('VERDICT: V1_PROMO_CAPTURE_PREFLIGHT_FAIL');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
