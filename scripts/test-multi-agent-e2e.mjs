/**
 * End-to-end multi-agent smoke harness (Phase 7).
 * Requires a running core API + auth token. Does not mutate Business/Seed/User.
 *
 *   TEST_BASE_URL=http://localhost:3001 TEST_TOKEN=... TEST_STORE_ID=... \
 *     node scripts/test-multi-agent-e2e.mjs
 */

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3001';
const TOKEN = process.env.TEST_TOKEN ?? '';
const STORE_ID = process.env.TEST_STORE_ID ?? null;
const TIMEOUT_MS = Number(process.env.TEST_TIMEOUT_MS ?? 5 * 60 * 1000);

async function runE2ETest() {
  console.log('=== Multi-Agent E2E Test ===\n');
  if (!TOKEN) {
    console.error('TEST_TOKEN required');
    process.exit(2);
  }

  const intakeRes = await fetch(`${BASE}/api/performer/intake/v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({
      message:
        'Create a summer campaign for my store. Include a graphic and copy.',
      prompt:
        'Create a summer campaign for my store. Include a graphic and copy.',
      storeId: STORE_ID,
      missionType: 'campaign_orchestration',
    }),
  });

  const intakeJson = await intakeRes.json().catch(() => ({}));
  const missionId =
    intakeJson.missionId ??
    intakeJson.mission?.id ??
    intakeJson.proposal?.missionId ??
    null;

  console.log('Intake status:', intakeRes.status);
  console.log('Action:', intakeJson.action ?? intakeJson.status ?? null);
  console.log('Mission created:', missionId);

  if (!missionId) {
    // Confirmation-gated path is still a valid Phase 1/7 outcome for live API.
    if (
      intakeJson.requiresConfirmation ||
      intakeJson.action === 'confirm_campaign_orchestration' ||
      intakeJson.status === 'pending_approval'
    ) {
      console.log('\n✅ PASSED — orchestration gated at confirmation (expected governance)');
      return;
    }
    console.error('\n❌ FAILED: no missionId and not pending confirmation');
    console.error(JSON.stringify(intakeJson, null, 2).slice(0, 2000));
    process.exit(1);
  }

  const started = Date.now();
  let verifyEvent = null;
  let learnEvent = null;
  const agentCompletions = [];
  const artifacts = [];

  while (Date.now() - started < TIMEOUT_MS) {
    const bbRes = await fetch(
      `${BASE}/api/performer/missions/${missionId}/blackboard?limit=200`,
      { headers: { Authorization: `Bearer ${TOKEN}` } },
    );
    const bb = await bbRes.json().catch(() => ({}));
    const events = Array.isArray(bb.events) ? bb.events : [];
    for (const e of events) {
      if (e.eventType === 'agent_completed') agentCompletions.push(e);
      if (e.eventType === 'skill:promotion_asset' || e.eventType === 'skill:analytics_report') {
        artifacts.push(e);
      }
      if (e.eventType === 'verify_complete') verifyEvent = e;
      if (e.eventType === 'learn_complete') learnEvent = e;
      if (e.eventType === 'orchestration_complete' || e.eventType === 'orchestration_halted') {
        // allow a brief moment for verify/learn append
      }
    }
    if (verifyEvent && learnEvent) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log('\n=== Results ===');
  console.log('Agent completions:', agentCompletions.length);
  console.log('Artifacts:', artifacts.length);
  console.log('Verify ran:', Boolean(verifyEvent));
  console.log('Learn ran:', Boolean(learnEvent));

  const failures = [];
  if (agentCompletions.length < 1) failures.push('No agent_completed events');
  if (!verifyEvent) failures.push('Verify step did not run');
  if (!learnEvent) failures.push('Learn step did not run');

  if (failures.length) {
    console.error('\n❌ FAILED:', failures.join('; '));
    process.exit(1);
  }
  console.log('\n✅ PASSED — Multi-agent pipeline complete');
}

runE2ETest().catch((e) => {
  console.error('E2E test error:', e.message);
  process.exit(1);
});
