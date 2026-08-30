#!/usr/bin/env node
/**
 * Golden Path Day 2 staging smoke — entry convergence only.
 * Verifies deployed dashboard bundle contains canonical create-store routes + source tags.
 */
const DASHBOARD = process.env.DASHBOARD_STAGING_URL || 'https://cardbey-dashboard-staging.onrender.com';
const CORE = process.env.CORE_STAGING_URL || 'https://cardbey-core-staging.onrender.com';

const CANONICAL_PATH = '/app?entry=performer&onboarding=1&newStore=1&starter=create_store';

const OPTIONAL_SOURCES = [
  // HomeCreateEntryCard is not mounted on live `/` (feed frontscreen); header/launcher cover entry.
  'home_create_entry',
  // actionCatalog path; PIL host uses pil_assistant_host on active concierge handoff.
  'pil_create_space',
];

const REQUIRED_SOURCES = [
  'public_header',
  'global_create_launcher',
  'explore_launcher_create',
  'explore_create_store',
  'create_new_business',
  'role_intent_business',
  'my_stores_empty',
  'catalog_empty',
  'pil_assistant_host',
];

const REQUIRED_STRINGS = [
  'Create Your Business',
  'public_header',
  'global_create_launcher',
  'explore_create_store',
];

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

async function fetchJson(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
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

function check(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function main() {
  console.log('Golden Path Day 2 staging smoke');
  console.log(`Dashboard: ${DASHBOARD}`);
  console.log(`Core: ${CORE}\n`);

  let allPass = true;

  // Core should remain Day 1 (no Day 2 core changes)
  try {
    const coreVer = await fetchJson(`${CORE}/api/runtime/version`);
    const sha = String(coreVer.commitSha || '').slice(0, 7);
    allPass = check('Core staging on Day 1 baseline', sha.startsWith('809200d'), `sha=${sha}`) && allPass;
  } catch (e) {
    allPass = check('Core runtime/version', false, e.message) && allPass;
  }

  // Dashboard HTML reachable
  let html = '';
  try {
    html = await fetchText(`${DASHBOARD}/`);
    allPass = check('Dashboard homepage reachable', html.length > 500) && allPass;
  } catch (e) {
    allPass = check('Dashboard homepage', false, e.message) && allPass;
    process.exit(1);
  }

  const scriptUrls = extractScriptSrcs(html, DASHBOARD);
  allPass = check('Dashboard JS bundles referenced', scriptUrls.length > 0, `${scriptUrls.length} scripts`) && allPass;

  // Fetch bundles (cap to avoid huge downloads)
  let bundleText = html;
  for (const url of scriptUrls.slice(0, 12)) {
    try {
      bundleText += '\n' + (await fetchText(url));
    } catch {
      /* optional chunk */
    }
  }

  allPass =
    check(
      'Canonical create-store query params in bundle',
      bundleText.includes('starter=create_store') &&
        bundleText.includes('entry=performer') &&
        bundleText.includes('onboarding=1') &&
        bundleText.includes('newStore'),
    ) && allPass;

  for (const s of REQUIRED_SOURCES) {
    allPass = check(`Source tag: ${s}`, bundleText.includes(s)) && allPass;
  }

  for (const s of OPTIONAL_SOURCES) {
    check(`Source tag (optional): ${s}`, bundleText.includes(s), bundleText.includes(s) ? 'present' : 'not in main bundle — see gate notes');
  }

  for (const s of REQUIRED_STRINGS) {
    allPass = check(`Bundle string: ${s}`, bundleText.includes(s)) && allPass;
  }

  // Demoted paths still present (not deleted)
  allPass = check('/create route retained (demoted)', bundleText.includes('/create')) && allPass;

  // Day 2: explore create_store should navigate, not only performer handoff for registry href
  allPass =
    check(
      'Explore create_store uses navigate + canonical href pattern',
      bundleText.includes('explore_create_store') && bundleText.includes(CANONICAL_PATH.split('?')[0]),
    ) && allPass;

  console.log('\n---');
  if (allPass) {
    console.log('VERDICT: CARDBEY_V1_GOLDEN_PATH_DAY2_ENTRY_CONVERGED (staging smoke PASS)');
    process.exit(0);
  }
  console.log('VERDICT: FAIL — fix before promoting gate');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
