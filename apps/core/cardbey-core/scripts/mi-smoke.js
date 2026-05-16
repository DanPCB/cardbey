/**
 * Minimal smoke test for MI Tool Contract v1 endpoints.
 * Run with: node scripts/mi-smoke.js
 * Requires server running (e.g. npm run dev). Base URL: BASE_URL or http://localhost:3001
 */

const BASE = process.env.BASE_URL || 'http://localhost:3001';

const miBody = (input, requestId = 'smoke-1') => ({
  requestId,
  actor: { role: 'buyer', userId: null, sessionId: null },
  context: { channel: 'api', locale: 'en', currency: 'USD', timezone: 'UTC' },
  input: input ?? {},
});

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  return { status: res.status, text: text.slice(0, 200) };
}

async function main() {
  console.log('MI smoke test base:', BASE);

  const r1 = await get('/mi/openapi.yaml');
  console.log('GET /mi/openapi.yaml:', r1.status, r1.status === 200 ? 'OK' : r1.text);

  const r2 = await post('/mi/v1/store/search', miBody({ limit: 5 }));
  console.log('POST /mi/v1/store/search:', r2.status, r2.data.ok ? 'ok' : r2.data.error?.code, r2.data.data?.stores?.length ?? 0, 'stores');

  const r3 = await post('/mi/v1/store/get-public', miBody({ storeIdOrSlug: 'any-store-slug' }));
  console.log('POST /mi/v1/store/get-public:', r3.status, r3.data.ok ? 'ok' : r3.data.error?.code);

  const r4 = await post('/mi/v1/catalog/list', miBody({ storeId: 'any-store-id' }));
  console.log('POST /mi/v1/catalog/list:', r4.status, r4.data.ok ? 'ok' : r4.data.error?.code, Array.isArray(r4.data.data?.items) ? r4.data.data.items.length + ' items' : '');

  const r5 = await post('/mi/v1/availability/get', miBody({ storeId: 's1', date: '2025-03-01' }));
  console.log('POST /mi/v1/availability/get:', r5.status, r5.data.ok ? 'ok' : r5.data.error?.code, r5.data.data?.timeSlots?.length ?? 0, 'slots');

  const r6 = await post('/mi/v1/booking/confirm', miBody({}, 'smoke-booking'));
  console.log('POST /mi/v1/booking/confirm:', r6.status, r6.data.ok === false && r6.data.error?.code === 'TEMPORARY_UNAVAILABLE' ? '501 (expected)' : JSON.stringify(r6.data.error));

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
