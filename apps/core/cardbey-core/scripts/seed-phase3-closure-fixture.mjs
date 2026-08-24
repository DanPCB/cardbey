/**
 * Fresh disposable fixture for Phase 3 closure pass.
 * Creates owner, other, platform_admin; florist store with Assessment show.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const CORE = (process.env.CORE_URL || 'http://127.0.0.1:3031').replace(/\/$/, '');
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tmp/phase3-browser-evidence');
fs.mkdirSync(outDir, { recursive: true });
const tag = `p3closure_${Date.now()}`;

async function api(method, urlPath, body, token) {
  const res = await fetch(`${CORE}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  const ownerPass = `Ow_${randomUUID().slice(0, 10)}!aA1`;
  const otherPass = `Ot_${randomUUID().slice(0, 10)}!aA1`;
  const adminPass = `Ad_${randomUUID().slice(0, 10)}!aA1`;
  const ownerEmail = `${tag}_owner@example.test`;
  const otherEmail = `${tag}_other@example.test`;
  const adminEmail = `${tag}_admin@example.test`;

  const owner = await api('POST', '/api/auth/register', {
    email: ownerEmail,
    password: ownerPass,
    name: 'P3 Closure Owner',
  });
  if (!owner.ok) throw new Error(`owner ${owner.status}`);
  const ownerToken = owner.data.token || owner.data.accessToken;
  const ownerId = owner.data.user?.id;

  const other = await api('POST', '/api/auth/register', {
    email: otherEmail,
    password: otherPass,
    name: 'P3 Closure Other',
  });
  const otherToken = other.data.token || other.data.accessToken;

  const admin = await api('POST', '/api/auth/register', {
    email: adminEmail,
    password: adminPass,
    name: 'P3 Closure Admin',
  });
  const adminToken = admin.data.token || admin.data.accessToken;
  const adminId = admin.data.user?.id;

  // Elevate admin to platform_admin in sqlite
  const db = new DatabaseSync('prisma/dev-fresh.db');
  db.prepare(`UPDATE User SET role = 'platform_admin' WHERE id = ?`).run(adminId);
  // Re-login admin to pick up role if JWT embeds it
  const adminLogin = await api('POST', '/api/auth/login', {
    email: adminEmail,
    password: adminPass,
    username: adminEmail,
  });
  const adminToken2 = adminLogin.data?.token || adminLogin.data?.accessToken || adminToken;

  const storeA = await api('POST', '/api/stores', { name: `P3 Closure Florist ${tag}` }, ownerToken);
  const storeAId = storeA.data?.id || storeA.data?.store?.id;
  await api(
    'PATCH',
    `/api/stores/${storeAId}`,
    { type: 'florist', description: 'NON_PRODUCTION closure fixture', isActive: false },
    ownerToken,
  );

  for (const s of [
    { title: 'Spring Bouquet', description: 'Fresh florist bouquet' },
    { title: 'Assessment', description: 'Unrelated consulting assessment' },
    { title: 'Basic Package', description: 'Unrelated package' },
  ]) {
    await api(
      'POST',
      `/api/stores/${storeAId}/shows`,
      {
        title: s.title,
        description: s.description,
        mediaUrl: `https://cdn.example.test/${encodeURIComponent(s.title)}.jpg`,
        status: 'PUBLISHED',
      },
      ownerToken,
    );
  }

  const storeB = await api('POST', '/api/stores', { name: `P3 Closure Cafe ${tag}` }, otherToken);
  const storeBId = storeB.data?.id || storeB.data?.store?.id;

  const listed = await api('GET', `/api/stores/${storeAId}/shows?includeArchived=1`, null, ownerToken);
  const shows = listed.data?.works || [];
  const assessment = shows.find((w) => w.title === 'Assessment');

  // Ensure draft exists via website editing resolve
  const resolve = await api(
    'POST',
    '/api/performer/content-editing-bridge/resolve',
    { storeId: storeAId, section: 'shows', itemId: assessment?.id },
    ownerToken,
  );

  const readiness = await api('GET', '/api/performer/content-editing-bridge/readiness', null, ownerToken);

  const manifest = {
    mark: 'NON_PRODUCTION_DISPOSABLE_CLOSURE',
    tag,
    coreUrl: CORE,
    dashboardUrl: process.env.DASHBOARD_URL || 'http://127.0.0.1:5191',
    owner: { id: ownerId, email: ownerEmail },
    other: { email: otherEmail },
    admin: { id: adminId, email: adminEmail, role: 'platform_admin' },
    storeAId,
    storeBId,
    shows: shows.map((w) => ({ id: w.id, title: w.title, status: w.status })),
    assessmentId: assessment?.id,
    draftId: resolve.data?.draftId || resolve.data?.context?.draftId || null,
    editManuallyUrl: resolve.data?.editManuallyUrl || null,
    readiness: readiness.data,
  };

  fs.writeFileSync(path.join(outDir, 'closure-fixture-manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    path.join(outDir, 'closure-fixture-secrets.json'),
    JSON.stringify(
      {
        ownerEmail,
        ownerPass,
        ownerToken,
        otherEmail,
        otherPass,
        otherToken,
        adminEmail,
        adminPass,
        adminToken: adminToken2,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        storeAId,
        assessmentId: assessment?.id,
        readiness: readiness.data?.overall,
        persistence: readiness.data?.proposalStorageMode,
        draftId: manifest.draftId,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
