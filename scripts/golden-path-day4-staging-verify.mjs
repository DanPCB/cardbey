#!/usr/bin/env node
/**
 * Golden Path Day 4 staging smoke — result-first reveal (business preview, not edit session).
 *
 * Usage:
 *   node scripts/golden-path-day4-staging-verify.mjs
 *   node scripts/golden-path-day4-staging-verify.mjs --full
 */
const DASHBOARD = process.env.DASHBOARD_STAGING_URL || 'https://cardbey-dashboard-staging.onrender.com';
const CORE =
  process.env.CORE_STAGING_URL ||
  (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : 'https://cardbey-core-staging.onrender.com');
const FULL = process.argv.includes('--full');

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
      source: 'golden_path_day4_verify',
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

async function main() {
  console.log('Golden Path Day 4 staging smoke — result-first reveal');
  console.log(`Dashboard: ${DASHBOARD}`);
  console.log(`Core: ${CORE}`);
  console.log(`Mode: ${FULL ? 'full' : 'quick'}\n`);

  let allPass = true;

  const home = await fetchText(`${DASHBOARD}/`);
  allPass = check('Dashboard homepage reachable', home.ok && home.text.length > 500, `HTTP ${home.status}`) && allPass;

  let bundleText = home.text;
  for (const url of extractScriptSrcs(home.text, DASHBOARD).slice(0, 14)) {
    try {
      const chunk = await fetchText(url);
      if (chunk.ok) bundleText += '\n' + chunk.text;
    } catch {
      /* optional chunk */
    }
  }

  // Production bundles minify function names; use string literals that survive build.
  const hasResultReveal = bundleText.includes('cardbey.goldenPath.resultReveal.v1');
  const hasPreviewRoute = bundleText.includes('/preview/website');
  const hasSuccessToast = bundleText.includes('Your business is ready');
  allPass = check('Day 4: result reveal module in bundle', hasResultReveal) && allPass;
  allPass =
    check('Day 4: promo progress filter in bundle', bundleText.includes('store-creation-promo-progress')) &&
    allPass;
  allPass = check('Day 4: website preview route in bundle', hasPreviewRoute) && allPass;
  allPass = check('Day 4: success toast copy in bundle', hasSuccessToast, hasSuccessToast ? 'present' : 'pending deploy') && allPass;
  allPass =
    check('Promo progress labels in bundle', bundleText.includes('Understanding your business')) && allPass;

  const health = await fetchJson(`${CORE}/api/health`);
  const coreUp = health.json?.status === 'ok' || health.json?.healthy === true;
  allPass = check('Core staging health', coreUp, coreUp ? '' : `HTTP ${health.status}`) && allPass;

  if (!coreUp) {
    console.log('\n---\nVERDICT: CARDBEY_V1_GOLDEN_PATH_DAY4_PARTIAL (core unavailable)\n');
    process.exit(1);
  }

  const guest = `day4-${Date.now()}`;
  const msd = await postIntake('modernsecuritydoors.com.au', guest);
  allPass = check('MSD URL intake → create_store', msd.json?.action === 'create_store', msd.json?.action) && allPass;

  if (FULL) {
    const guestFull = `day4-full-${Date.now()}`;
    const intake = await postIntake('modernsecuritydoors.com.au', guestFull);
    const draftFields = intake.json?.storeCreationDraft?.draft ?? {};
    const start = await postIntake('modernsecuritydoors.com.au', guestFull, {
      primaryMode: 'create',
      freshStoreMission: true,
      storeCreateForm: {
        storeName: draftFields.name || 'Modern Security Doors',
        website: draftFields.website || 'https://modernsecuritydoors.com.au',
        location: draftFields.location || 'Melbourne',
        category: draftFields.category || 'Home & garden',
      },
      _autoSubmit: true,
    });

    const missionDetail =
      start.json?.action === 'store_mission_started'
        ? start.json.action
        : start.json?.error || start.json?.errors?.[0]?.code || start.json?.action;
    allPass = check('MSD mission started', start.json?.action === 'store_mission_started', missionDetail) && allPass;

    const missionId = start.json?.missionId;
    if (missionId) {
      const poll = await pollMissionState(missionId, guestFull);
      allPass =
        check('structured_store_build completed', poll.ok, poll.failed ? 'failed' : poll.timeout ? 'timeout' : '') &&
        allPass;

      const buildStep = (poll.state?.steps || []).find((s) =>
        String(s.toolName || '').includes('structured_store_build'),
      );
      const genRun =
        start.json?.generationRunId ||
        poll.state?.generationRunId ||
        poll.state?.metadata?.generationRunId ||
        poll.state?.outputs?.generationRunId ||
        buildStep?.output?.generationRunId ||
        buildStep?.output?.jobId;
      const draftIdFromState =
        poll.state?.draftId ||
        poll.state?.outputs?.draftId ||
        poll.state?.result?.draftId ||
        poll.state?.metadata?.draftId ||
        poll.state?.preview?.draftId ||
        buildStep?.output?.draftId ||
        start.json?.draftId;

      let draftId = draftIdFromState;
      if (genRun) {
        const draft = await fetchJson(
          `${CORE}/api/stores/temp/draft?generationRunId=${encodeURIComponent(genRun)}`,
          { headers: { 'X-Guest-Session': guestFull } },
        );
        draftId =
          draft.json?.draftId ||
          draft.json?.draft?.id ||
          (typeof draft.json?.draft === 'object' ? draft.json.draft?.id : null) ||
          draftId;
        allPass =
          check(
            'Draft ready for result surface',
            draft.json?.status === 'ready' ||
              draft.json?.draft?.status === 'ready' ||
              Boolean(draftId),
            draft.json?.status || draft.json?.draft?.status || (draftId ? 'draftId' : 'missing'),
          ) && allPass;
      } else {
        allPass =
          check('generationRunId or draftId present after build', Boolean(draftId), 'missing both') && allPass;
      }

      if (draftId) {
        const previewPath = `/preview/website/${draftId}`;
        const preview = await fetchText(`${DASHBOARD}${previewPath}`);
        allPass =
          check('Website preview route reachable', preview.ok, `HTTP ${preview.status}`) && allPass;
        allPass =
          check(
            'Result route is preview (not edit-session review)',
            !preview.text.includes("couldn't reopen the exact store editing session"),
          ) && allPass;
        // W0.3 — reload must not lose the result surface (same URL, second fetch).
        const previewReload = await fetchText(`${DASHBOARD}${previewPath}`);
        allPass =
          check(
            'Website preview survives refresh',
            previewReload.ok && !previewReload.text.includes("couldn't reopen the exact store editing session"),
            `HTTP ${previewReload.status}`,
          ) && allPass;
        console.log(`  preview: ${DASHBOARD}${previewPath}`);
      } else {
        allPass = check('Draft id available for preview/refresh canary', false, 'no draftId') && allPass;
      }
    }
  } else {
    console.log('\n[SKIP] Full MSD mission poll (pass --full)');
  }

  console.log('\n---');
  if (allPass) {
    console.log('VERDICT: CARDBEY_V1_GOLDEN_PATH_DAY4_RESULT_FIRST_REVEAL_READY');
    process.exit(0);
  }
  console.log('VERDICT: CARDBEY_V1_GOLDEN_PATH_DAY4_PARTIAL');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
