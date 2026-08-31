#!/usr/bin/env node
/**
 * Golden Path Day 3 staging smoke — intelligence-first intake (API).
 */
const CORE = process.env.CORE_STAGING_URL || 'https://cardbey-core-staging.onrender.com';

const CASES = [
  {
    id: 'A_url_only',
    userMessage: 'modernsecuritydoors.com.au',
    expectAction: 'create_store',
    forbidMissing: ['category', 'location'],
  },
  {
    id: 'B_name_only',
    userMessage: 'Market Lane Coffee',
    expectAction: 'create_store',
    forbidMissing: ['category', 'location'],
  },
  {
    id: 'C_description',
    userMessage: 'I run a Vietnamese packaging factory and want customers in Australia.',
    expectAction: 'create_store',
    forbidMissing: [],
  },
  {
    id: 'D_handyman',
    userMessage: 'I run a handyman business in Melbourne.',
    expectAction: 'create_store',
    forbidMissing: ['location'],
  },
  {
    id: 'E_insufficient',
    userMessage: 'Help me start something.',
    expectClarify: true,
  },
];

async function postIntake(message) {
  const res = await fetch(`${CORE}/api/performer/intake/v2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userMessage: message,
      source: 'golden_path_day3_verify',
      primaryModeHint: 'store_setup',
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function check(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function main() {
  console.log('Golden Path Day 3 staging smoke (core intake API)');
  console.log(`Core: ${CORE}\n`);
  let allPass = true;

  const ver = await fetch(`${CORE}/api/runtime/version`).then((r) => r.json());
  console.log(`Deploy SHA: ${String(ver.commitSha || '').slice(0, 12)}\n`);

  for (const c of CASES) {
    const { status, body } = await postIntake(c.userMessage);
    const action = body.action;
    const missing = body.missingFields || body.storeCreationDraft?.missingFields || [];
    allPass =
      check(`${c.id} HTTP 200`, status === 200, `status=${status}`) && allPass;
    if (c.expectAction) {
      allPass = check(`${c.id} action`, action === c.expectAction, action) && allPass;
    }
    if (c.forbidMissing?.length) {
      for (const field of c.forbidMissing) {
        allPass =
          check(`${c.id} missing not ${field}`, !missing.includes(field), JSON.stringify(missing)) &&
          allPass;
      }
    }
    if (c.expectClarify) {
      const clarified =
        action === 'clarify' ||
        body.storeCreationDraft?.intakeAssessment?.clarificationReason === 'insufficient_input';
      allPass = check(`${c.id} clarification`, clarified, action) && allPass;
    }
  }

  console.log('\n---');
  if (allPass) {
    console.log('VERDICT: CARDBEY_V1_GOLDEN_PATH_DAY3_INTELLIGENCE_FIRST_INTAKE_READY (staging smoke PASS)');
    process.exit(0);
  }
  console.log('VERDICT: FAIL');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
