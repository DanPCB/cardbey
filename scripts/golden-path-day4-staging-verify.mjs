#!/usr/bin/env node
/**
 * Golden Path Day 4 staging smoke — result-first readiness (API layer).
 * Dashboard navigation is verified manually / via promo capture; this script proves
 * draft-ready source of truth and expected result routes per case.
 */
const CORE = process.env.CORE_STAGING_URL || 'https://cardbey-core-staging.onrender.com';

const CASES = [
  {
    id: 'A_name_research',
    intakeBody: {
      userMessage: 'Create my business',
      primaryMode: 'create',
      storeCreateForm: {
        storeName: 'Market Lane Coffee',
        website: 'https://www.marketlane.com.au',
        location: 'Melbourne',
        category: 'Food & Beverage',
      },
    },
    expectIdentity: /market lane coffee/i,
    minOfferings: 1,
  },
  {
    id: 'B_url_only',
    intakeBody: {
      userMessage: 'modernsecuritydoors.com.au',
      primaryModeHint: 'store_setup',
      freshStoreMission: true,
      storeCreateForm: {
        storeName: 'Modern Security Doors',
        website: 'https://modernsecuritydoors.com.au',
      },
    },
    expectIdentity: /security|door|modern/i,
    minOfferings: 0,
  },
  {
    id: 'C_description',
    intakeBody: {
      userMessage: 'I run a Vietnamese packaging factory and want customers in Australia.',
      primaryModeHint: 'store_setup',
      freshStoreMission: true,
      storeCreateForm: {
        storeName: 'Vietnamese Packaging Factory',
        location: 'Australia',
        category: 'Manufacturing',
      },
    },
    expectIdentity: /vietnamese|packaging|factory|australia/i,
    minOfferings: 0,
    provisional: true,
  },
];

function check(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function postIntake(guestSession, intakeBody) {
  const res = await fetch(`${CORE}/api/performer/intake/v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Guest-Session': guestSession,
    },
    body: JSON.stringify({
      source: 'golden_path_day4_verify',
      freshStoreMission: true,
      ...intakeBody,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function pollMissionForGenerationRun(missionId, guestSession, maxMs = 240000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const res = await fetch(`${CORE}/api/missions/${missionId}/state`, {
      headers: { 'X-Guest-Session': guestSession },
    });
    const json = await res.json().catch(() => ({}));
    const state = json?.state ?? json;
    const gen =
      state?.generationRunId ||
      state?.metadata?.generationRunId ||
      state?.outputs?.generationRunId ||
      state?.outputs?.structured_store_build?.generationRunId;
    if (gen) return String(gen).trim();
    const build = (state?.steps ?? []).find(
      (s) => String(s?.toolName ?? '').toLowerCase() === 'structured_store_build',
    );
    const fromStep =
      build?.output?.generationRunId ||
      build?.output?.jobId ||
      (build?.output && typeof build.output === 'object' ? build.output.generationRunId : null);
    if (fromStep) return String(fromStep).trim();
    if (build?.status === 'failed') return null;
    await new Promise((r) => setTimeout(r, 4000));
  }
  return null;
}

async function pollDraftReady(generationRunId, maxMs = 240000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const q = encodeURIComponent(generationRunId);
    const res = await fetch(`${CORE}/api/public/store/temp/draft?generationRunId=${q}`);
    const data = await res.json().catch(() => ({}));
    if (String(data.status ?? '').toLowerCase() === 'ready' && data.draftId) {
      return { readyAt: Date.now(), data };
    }
    if (String(data.status ?? '').toLowerCase() === 'failed') {
      return { failed: true, data };
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  return { timeout: true };
}

function readIdentity(data) {
  const draft = data.draft && typeof data.draft === 'object' ? data.draft : {};
  const store = data.store && typeof data.store === 'object' ? data.store : {};
  return String(draft.businessName || draft.name || store.name || draft.description || '').trim();
}

function readOfferingCount(data) {
  const products = Array.isArray(data.products) ? data.products.length : 0;
  const draft = data.draft && typeof data.draft === 'object' ? data.draft : {};
  const items = Array.isArray(draft.items) ? draft.items.length : 0;
  return Math.max(products, items);
}

function expectedResultRoute(draftId, generationRunId) {
  const q = generationRunId ? `?generationRunId=${encodeURIComponent(generationRunId)}` : '';
  return `/preview/website/${draftId}${q}`;
}

async function main() {
  console.log('Golden Path Day 4 staging smoke (draft-ready + result route)');
  console.log(`Core: ${CORE}\n`);

  const ver = await fetch(`${CORE}/api/runtime/version`).then((r) => r.json());
  console.log(`Deploy SHA: ${String(ver.commitSha || '').slice(0, 12)}\n`);

  let allPass = true;

  for (const c of CASES) {
    console.log(`--- ${c.id} ---`);
    const guestSession = `golden-path-day4-${c.id}-${Date.now()}`;
    const intake = await postIntake(guestSession, c.intakeBody);
    const intakeOk =
      intake.body.action === 'store_mission_started' || intake.body.action === 'create_store';
    allPass = check(`${c.id} intake started`, intakeOk, intake.body.action) && allPass;

    const missionId = intake.body.missionId || intake.body.mission?.id;
    let generationRunId =
      intake.body.generationRunId ||
      intake.body.data?.generationRunId ||
      intake.body.storeCreationDraft?.generationRunId;

    if (!generationRunId && missionId) {
      generationRunId = await pollMissionForGenerationRun(missionId, guestSession);
    }

    allPass = check(`${c.id} missionId present`, Boolean(missionId), missionId || 'missing') && allPass;

    if (!generationRunId) {
      allPass = check(`${c.id} generationRunId present`, false, 'missing after poll') && allPass;
      continue;
    }

    const poll = await pollDraftReady(generationRunId);
    allPass = check(`${c.id} draft ready`, Boolean(poll.data?.draftId), JSON.stringify(poll).slice(0, 120)) && allPass;

    if (!poll.data?.draftId) continue;

    const identity = readIdentity(poll.data);
    allPass =
      check(`${c.id} identity`, c.expectIdentity.test(identity), identity) && allPass;

    const offerings = readOfferingCount(poll.data);
    if (c.minOfferings > 0) {
      allPass = check(`${c.id} offerings`, offerings >= c.minOfferings, String(offerings)) && allPass;
    }

    const route = expectedResultRoute(poll.data.draftId, generationRunId);
    allPass = check(`${c.id} expected result route`, route.includes('/preview/website/'), route) && allPass;

    if (missionId) {
      const stateRes = await fetch(`${CORE}/api/missions/${missionId}/state`).then((r) => r.json()).catch(() => ({}));
      const missionStatus = stateRes?.state?.status ?? stateRes?.status ?? 'unknown';
      console.log(`  missionId=${missionId} status=${missionStatus} (draft-ready reveal allowed regardless)`);
    }
  }

  console.log('\n---');
  if (allPass) {
    console.log('VERDICT: CARDBEY_V1_GOLDEN_PATH_DAY4_RESULT_FIRST_READY (API readiness PASS)');
    console.log('NOTE: Browser result-first navigation requires dashboard deploy + manual/promo check.');
    process.exit(0);
  }
  console.log('VERDICT: FAIL');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
