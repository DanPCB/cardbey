/**
 * Disposable Global Live EOI lifecycle probe (ops readiness).
 * Uses synthetic emails only — never real applicant PII.
 *
 * Usage (core running with EOI flags on):
 *   node scripts/e2e-global-live-eoi-ops.mjs
 */

const BASE = process.env.CORE_BASE_URL || 'http://localhost:3001';
const stamp = Date.now();
const emailA = `eoi.ops.${stamp}@example.test`;
const emailB = `eoi.ops.owner.${stamp}@example.test`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function json(res) {
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  console.log('[EOI-OPS] base=', BASE);

  const config = await json(await fetch(`${BASE}/api/public/global-live/config`));
  if (config.status === 403) {
    console.log('GLOBAL_LIVE_EOI_OPS_PARTIAL — enable ENABLE_GLOBAL_LIVE_EOI_V1 + GLOBAL_LIVE_EOI_OPEN');
    process.exit(2);
  }
  assert(config.body.ok === true, 'config ok');
  assert(config.body.open === true, 'EOI must be open for this probe');

  const payload = {
    name: 'Ops Probe',
    businessName: `Ops Probe Biz ${stamp}`,
    industry: 'Test services',
    city: 'Ho Chi Minh',
    country: 'Vietnam',
    phone: '+84900000001',
    email: emailA,
    showcaseTypes: ['services'],
    businessDescription: 'Disposable EOI ops probe — ignore.',
    existingCardbeyBusiness: 'no',
    language: 'vi',
    consentGranted: true,
    source: 'e2e_ops_probe',
    utmSource: 'ops',
    utmMedium: 'script',
    utmCampaign: 'global_live_eoi_ops',
  };

  const first = await json(
    await fetch(`${BASE}/api/public/global-live/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
  assert(first.status === 201 && first.body.ok === true, 'first submit 201');
  assert(first.body.alreadyReceived !== true, 'first submit not duplicate');

  const dup = await json(
    await fetch(`${BASE}/api/public/global-live/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
  assert(dup.status === 201 && dup.body.alreadyReceived === true, 'soft-dedupe alreadyReceived');

  console.log('[EOI-OPS] Public submit + soft-dedupe OK for', emailA);
  console.log('[EOI-OPS] Admin list/health require platform-admin cookie — verify in UI /control-center/global-live-eoi');
  console.log('[EOI-OPS] Confirmation email: check SMTP inbox or core logs for Confirmation attempted (no PII body)');
  console.log('GLOBAL_LIVE_EOI_OPS_PROBE_PARTIAL_OK');
}

main().catch((err) => {
  console.error('GLOBAL_LIVE_EOI_OPS_PROBE_FAILED', err.message);
  process.exit(1);
});
