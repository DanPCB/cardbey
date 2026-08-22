/**
 * Live Market Batch C — real Prisma + real JWT auth integration tests.
 * Uses a disposable SQLite DB (db push of current schema). Does not touch test.db/dev.db.
 */

import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDisposableSchemaSqlite } from './testHarness/disposableSqlite.js';

const FLAG_KEYS = [
  'ENABLE_LIVE_MARKET_V1',
  'ENABLE_LIVE_MARKET_ADMIN_V1',
  'ENABLE_LIVE_MARKET_OWNER_V1',
  'ENABLE_LIVE_MARKET_PUBLIC_V1',
  'ENABLE_LIVE_MARKET_STOREFRONT_PUBLISH_V1',
  'ENABLE_LIVE_MARKET_STOREFRONT_CONSUME_V1',
  'LIVE_MARKET_ALLOW_FAKE_PROVIDER',
];

/** @type {Awaited<ReturnType<typeof createDisposableSchemaSqlite>> | null} */
let disposable = null;
/** @type {import('@prisma/client').PrismaClient | null} */
let prisma = null;

vi.mock('../prisma.js', () => {
  const handler = {
    get(_t, prop) {
      if (prop === 'then') return undefined;
      const client = prisma;
      if (!client) return undefined;
      const value = client[prop];
      return typeof value === 'function' ? value.bind(client) : value;
    },
  };
  const proxy = new Proxy({}, handler);
  return {
    getPrismaClient: () => prisma,
    resetPrismaClientForRecovery: () => {},
    ensurePrismaConnection: async () => prisma,
    disconnectDatabase: async () => {},
    default: proxy,
    prisma: proxy,
  };
});

const { generateToken } = await import('../../middleware/auth.js');
const { LIVE_MARKET_ERROR_CODES } = await import('./domain.js');
const { FakeLiveVideoProvider, resolveLiveVideoProvider, NotConfiguredLiveVideoProvider } =
  await import('./providers.js');
const {
  liveMarketOwnerRoutes,
  liveMarketAdminRoutes,
  liveMarketPublicRoutes,
} = await import('./routes.js');
const { prepareSession } = await import('./service.js');

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/stores', liveMarketOwnerRoutes);
  app.use('/api/admin/live-market', liveMarketAdminRoutes);
  app.use('/api/public/live-market', liveMarketPublicRoutes);
  return app;
}

async function seedUser({ email, role = 'owner' }) {
  return prisma.user.create({
    data: {
      email,
      passwordHash: 'test-hash',
      role,
      roles: role === 'platform_admin' || role === 'super_admin' ? `["${role}"]` : '["viewer"]',
      emailVerified: true,
    },
  });
}

async function seedStore(ownerUserId, slug) {
  return prisma.business.create({
    data: {
      userId: ownerUserId,
      name: `Store ${slug}`,
      type: 'salon',
      slug,
      isActive: true,
    },
  });
}

async function seedProduct(storeId, { name, itemType }) {
  return prisma.product.create({
    data: {
      businessId: storeId,
      name,
      itemType,
      isPublished: true,
    },
  });
}

describe('liveMarket integration (disposable SQLite + JWT)', () => {
  const envBackup = {};
  /** @type {express.Express} */
  let app;
  let admin;
  let owner;
  let other;
  let adminToken;
  let ownerToken;
  let otherToken;
  let store;
  let otherStore;
  let productRow;
  let serviceRow;

  beforeAll(async () => {
    for (const k of FLAG_KEYS) envBackup[k] = process.env[k];
    process.env.ENABLE_LIVE_MARKET_V1 = 'true';
    process.env.ENABLE_LIVE_MARKET_ADMIN_V1 = 'true';
    process.env.ENABLE_LIVE_MARKET_OWNER_V1 = 'true';
    process.env.ENABLE_LIVE_MARKET_PUBLIC_V1 = 'true';
    process.env.ENABLE_LIVE_MARKET_STOREFRONT_PUBLISH_V1 = 'true';
    process.env.ENABLE_LIVE_MARKET_STOREFRONT_CONSUME_V1 = 'true';
    delete process.env.LIVE_MARKET_ALLOW_FAKE_PROVIDER;

    disposable = createDisposableSchemaSqlite({ label: 'api-it' });
    prisma = disposable.prisma;

    admin = await seedUser({ email: `admin_${Date.now()}@example.com`, role: 'platform_admin' });
    owner = await seedUser({ email: `owner_${Date.now()}@example.com`, role: 'owner' });
    other = await seedUser({ email: `other_${Date.now()}@example.com`, role: 'owner' });
    adminToken = generateToken(admin.id);
    ownerToken = generateToken(owner.id);
    otherToken = generateToken(other.id);

    store = await seedStore(owner.id, `lm-owner-${Date.now()}`);
    otherStore = await seedStore(other.id, `lm-other-${Date.now()}`);
    productRow = await seedProduct(store.id, { name: 'Nail polish', itemType: 'product' });
    serviceRow = await seedProduct(store.id, { name: 'Manicure', itemType: 'service' });
    await seedProduct(otherStore.id, { name: 'Other product', itemType: 'product' });

    app = buildApp();
  }, 180_000);

  afterAll(async () => {
    for (const k of FLAG_KEYS) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    }
    if (disposable) await disposable.cleanup();
    prisma = null;
  });

  beforeEach(() => {
    process.env.ENABLE_LIVE_MARKET_V1 = 'true';
    process.env.ENABLE_LIVE_MARKET_ADMIN_V1 = 'true';
    process.env.ENABLE_LIVE_MARKET_OWNER_V1 = 'true';
    process.env.ENABLE_LIVE_MARKET_PUBLIC_V1 = 'true';
    delete process.env.LIVE_MARKET_ALLOW_FAKE_PROVIDER;
  });

  it('admin can create and transition pilot enrolment; non-admin cannot', async () => {
    const denied = await request(app)
      .post('/api/admin/live-market/enrollments')
      .set(auth(ownerToken))
      .send({ storeId: store.id, state: 'ACTIVE' });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post('/api/admin/live-market/enrollments')
      .set(auth(adminToken))
      .send({ storeId: store.id, state: 'INVITED' });
    expect(created.status).toBe(201);
    expect(created.body.enrollment.state).toBe('INVITED');

    const toApproved = await request(app)
      .patch(`/api/admin/live-market/enrollments/${created.body.enrollment.id}`)
      .set(auth(adminToken))
      .send({ state: 'APPROVED' });
    expect(toApproved.status).toBe(200);

    const toOnboarding = await request(app)
      .patch(`/api/admin/live-market/enrollments/${created.body.enrollment.id}`)
      .set(auth(adminToken))
      .send({ state: 'ONBOARDING' });
    expect(toOnboarding.status).toBe(200);

    const toActive = await request(app)
      .patch(`/api/admin/live-market/enrollments/${created.body.enrollment.id}`)
      .set(auth(adminToken))
      .send({ state: 'ACTIVE' });
    expect(toActive.status).toBe(200);
    expect(toActive.body.enrollment.state).toBe('ACTIVE');

    const audits = await prisma.auditEvent.findMany({
      where: { entityType: 'LiveMarketPilotEnrollment', entityId: created.body.enrollment.id },
    });
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });

  it('owner without enrolment is rejected; active owner can create/update/schedule/cancel', async () => {
    const bareOwner = await seedUser({ email: `bare_${Date.now()}@example.com` });
    const bareStore = await seedStore(bareOwner.id, `lm-bare-${Date.now()}`);
    const bareToken = generateToken(bareOwner.id);

    const statusBare = await request(app)
      .get(`/api/stores/${bareStore.id}/live-market/status`)
      .set(auth(bareToken));
    expect(statusBare.status).toBe(200);
    expect(statusBare.body.status.enrolled).toBe(false);
    expect(statusBare.body.status.capabilities.canCreateDraft).toBe(false);
    expect(statusBare.body.status.streamingOperational).toBe(false);
    expect(statusBare.body.status.providerReadiness).toBe('NOT_CONFIGURED');
    expect(JSON.stringify(statusBare.body)).not.toMatch(/ActorId|providerExternalRef|approvedHost/i);

    const rejected = await request(app)
      .post(`/api/stores/${bareStore.id}/live-sessions`)
      .set(auth(bareToken))
      .send({ title: 'No enrol' });
    expect(rejected.status).toBe(403);
    expect(rejected.body.error).toBe(LIVE_MARKET_ERROR_CODES.LIVE_STORE_NOT_ENROLLED);

    const statusActive = await request(app)
      .get(`/api/stores/${store.id}/live-market/status`)
      .set(auth(ownerToken));
    expect(statusActive.status).toBe(200);
    expect(statusActive.body.status.enrollmentState).toBe('ACTIVE');
    expect(statusActive.body.status.capabilities.canSchedule).toBe(true);
    expect(statusActive.body.status.capabilities.canPrepare).toBe(false);
    expect(statusActive.body.status.streamingOperational).toBe(false);

    const created = await request(app)
      .post(`/api/stores/${store.id}/live-sessions`)
      .set(auth(ownerToken))
      .send({ title: 'VI nails live', sourceLanguage: 'vi', viewerLanguages: ['en'] });
    expect(created.status).toBe(201);
    expect(created.body.session.state).toBe('DRAFT');
    const sessionId = created.body.session.id;

    const patched = await request(app)
      .patch(`/api/stores/${store.id}/live-sessions/${sessionId}`)
      .set(auth(ownerToken))
      .send({ description: 'Pilot draft' });
    expect(patched.status).toBe(200);
    expect(patched.body.session.description).toBe('Pilot draft');

    const scheduled = await request(app)
      .post(`/api/stores/${store.id}/live-sessions/${sessionId}/schedule`)
      .set(auth(ownerToken))
      .send({ scheduledStartAt: '2026-09-01T10:00:00.000Z' });
    expect(scheduled.status).toBe(200);
    expect(scheduled.body.session.state).toBe('SCHEDULED');

    const cancelled = await request(app)
      .post(`/api/stores/${store.id}/live-sessions/${sessionId}/cancel`)
      .set(auth(ownerToken))
      .send({});
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.session.state).toBe('CANCELLED');

    const sessionAudits = await prisma.auditEvent.findMany({
      where: { entityType: 'LiveMarketSession', entityId: sessionId },
    });
    expect(sessionAudits.length).toBeGreaterThanOrEqual(2);
  });

  it('authenticated non-owner cannot access another store session', async () => {
    const statusStolen = await request(app)
      .get(`/api/stores/${store.id}/live-market/status`)
      .set(auth(otherToken));
    expect(statusStolen.status).toBe(403);

    const created = await request(app)
      .post(`/api/stores/${store.id}/live-sessions`)
      .set(auth(ownerToken))
      .send({ title: 'Owner only' });
    const sessionId = created.body.session.id;

    const stolen = await request(app)
      .get(`/api/stores/${store.id}/live-sessions/${sessionId}`)
      .set(auth(otherToken));
    expect(stolen.status).toBe(403);
  });

  it('subjects: PRODUCT + SERVICE via Product identity; cross-store rejected', async () => {
    const created = await request(app)
      .post(`/api/stores/${store.id}/live-sessions`)
      .set(auth(ownerToken))
      .send({ title: 'Subjects' });
    const sessionId = created.body.session.id;

    const ok = await request(app)
      .put(`/api/stores/${store.id}/live-sessions/${sessionId}/subjects`)
      .set(auth(ownerToken))
      .send({
        subjects: [
          { subjectType: 'PRODUCT', subjectId: productRow.id },
          { subjectType: 'SERVICE', subjectId: serviceRow.id },
        ],
      });
    expect(ok.status).toBe(200);
    expect(ok.body.session.subjects).toHaveLength(2);

    const cross = await prisma.product.findFirst({
      where: { businessId: otherStore.id },
    });
    const bad = await request(app)
      .put(`/api/stores/${store.id}/live-sessions/${sessionId}/subjects`)
      .set(auth(ownerToken))
      .send({ subjects: [{ subjectType: 'PRODUCT', subjectId: cross.id }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe(LIVE_MARKET_ERROR_CODES.LIVE_SUBJECT_STORE_MISMATCH);
  });

  it('paused enrolment blocks schedule/prepare/start; prepare without provider returns LIVE_PROVIDER_NOT_CONFIGURED', async () => {
    const enrollment = await prisma.liveMarketPilotEnrollment.findUnique({
      where: { storeId: store.id },
    });

    const draft = await request(app)
      .post(`/api/stores/${store.id}/live-sessions`)
      .set(auth(ownerToken))
      .send({ title: 'Provider check' });
    const sessionId = draft.body.session.id;

    const scheduled = await request(app)
      .post(`/api/stores/${store.id}/live-sessions/${sessionId}/schedule`)
      .set(auth(ownerToken))
      .send({ scheduledStartAt: '2026-09-02T10:00:00.000Z' });
    expect(scheduled.status).toBe(200);

    const prepareBlocked = await request(app)
      .post(`/api/stores/${store.id}/live-sessions/${sessionId}/prepare`)
      .set(auth(ownerToken))
      .send({});
    expect(prepareBlocked.status).toBe(409);
    expect(prepareBlocked.body.error).toBe(LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED);

    await request(app)
      .patch(`/api/admin/live-market/enrollments/${enrollment.id}`)
      .set(auth(adminToken))
      .send({ state: 'PAUSED' });

    const pausedStatus = await request(app)
      .get(`/api/stores/${store.id}/live-market/status`)
      .set(auth(ownerToken));
    expect(pausedStatus.status).toBe(200);
    expect(pausedStatus.body.status.enrollmentState).toBe('PAUSED');
    expect(pausedStatus.body.status.capabilities.canEditDraft).toBe(true);
    expect(pausedStatus.body.status.capabilities.canCancel).toBe(true);
    expect(pausedStatus.body.status.capabilities.canSchedule).toBe(false);
    expect(pausedStatus.body.status.capabilities.canPrepare).toBe(false);
    expect(pausedStatus.body.status.streamingOperational).toBe(false);

    const scheduleWhilePaused = await request(app)
      .post(`/api/stores/${store.id}/live-sessions`)
      .set(auth(ownerToken))
      .send({ title: 'Paused draft ok' });
    expect(scheduleWhilePaused.status).toBe(201);
    const pausedSessionId = scheduleWhilePaused.body.session.id;

    const scheduleDenied = await request(app)
      .post(`/api/stores/${store.id}/live-sessions/${pausedSessionId}/schedule`)
      .set(auth(ownerToken))
      .send({});
    expect(scheduleDenied.status).toBe(403);
    expect(scheduleDenied.body.error).toBe(LIVE_MARKET_ERROR_CODES.LIVE_ENROLLMENT_NOT_ACTIVE);

    const prepareDenied = await request(app)
      .post(`/api/stores/${store.id}/live-sessions/${pausedSessionId}/prepare`)
      .set(auth(ownerToken))
      .send({});
    expect(prepareDenied.status).toBe(403);

    // Resume for remaining tests
    await request(app)
      .patch(`/api/admin/live-market/enrollments/${enrollment.id}`)
      .set(auth(adminToken))
      .send({ state: 'ACTIVE' });
  });

  it('invalid lifecycle transition rejected; fake provider only via explicit injection', async () => {
    expect(resolveLiveVideoProvider()).toBeInstanceOf(NotConfiguredLiveVideoProvider);

    const created = await request(app)
      .post(`/api/stores/${store.id}/live-sessions`)
      .set(auth(ownerToken))
      .send({ title: 'Transition' });
    const sessionId = created.body.session.id;

    const startFromDraft = await request(app)
      .post(`/api/stores/${store.id}/live-sessions/${sessionId}/start`)
      .set(auth(ownerToken))
      .send({});
    expect(startFromDraft.status).toBe(409);
    expect(startFromDraft.body.error).toBe(LIVE_MARKET_ERROR_CODES.LIVE_INVALID_TRANSITION);

    await request(app)
      .post(`/api/stores/${store.id}/live-sessions/${sessionId}/schedule`)
      .set(auth(ownerToken))
      .send({});

    const ready = await prepareSession({
      prisma,
      storeId: store.id,
      sessionId,
      hostUserId: owner.id,
      videoProvider: new FakeLiveVideoProvider(),
    });
    expect(ready.state).toBe('READY');

    process.env.LIVE_MARKET_ALLOW_FAKE_PROVIDER = 'true';
    expect(resolveLiveVideoProvider()).toBeInstanceOf(FakeLiveVideoProvider);
    delete process.env.LIVE_MARKET_ALLOW_FAKE_PROVIDER;
    expect(resolveLiveVideoProvider()).toBeInstanceOf(NotConfiguredLiveVideoProvider);
  });

  it('public API excludes drafts and internal fields; requires storefront publication', async () => {
    const draft = await request(app)
      .post(`/api/stores/${store.id}/live-sessions`)
      .set(auth(ownerToken))
      .send({ title: 'Hidden draft' });
    const draftId = draft.body.session.id;

    const hidden = await request(app).get(`/api/public/live-market/sessions/${draftId}`);
    expect(hidden.status).toBe(404);

    const sched = await request(app)
      .post(`/api/stores/${store.id}/live-sessions`)
      .set(auth(ownerToken))
      .send({ title: 'Public scheduled' });
    await request(app)
      .post(`/api/stores/${store.id}/live-sessions/${sched.body.session.id}/schedule`)
      .set(auth(ownerToken))
      .send({ scheduledStartAt: '2030-09-03T10:00:00.000Z' });

    // Scheduled but unpublished stays hidden
    const unpublished = await request(app).get(
      `/api/public/live-market/sessions/${sched.body.session.id}`,
    );
    expect(unpublished.status).toBe(404);

    // Set a provider ref privately
    await prisma.liveMarketSession.update({
      where: { id: sched.body.session.id },
      data: { providerExternalRef: 'secret-provider-ref', failureReasonCode: 'X' },
    });

    const published = await request(app)
      .post(`/api/stores/${store.id}/live-sessions/${sched.body.session.id}/publish-storefront`)
      .set(auth(ownerToken))
      .send({});
    expect(published.status).toBe(200);
    expect(published.body.session.storefrontPublicationStatus).toBe('PUBLISHED');
    expect(published.body.session.state).toBe('SCHEDULED');

    const pub = await request(app).get(
      `/api/public/live-market/sessions/${sched.body.session.id}`,
    );
    expect(pub.status).toBe(200);
    expect(pub.body.session.state).toBe('SCHEDULED');
    expect(pub.body.session.publicState).toBe('upcoming');
    expect(pub.body.session.providerConfirmedLive).toBe(false);
    expect(pub.body.session.hostUserId).toBeUndefined();
    expect(pub.body.session.providerExternalRef).toBeUndefined();
    expect(pub.body.session.failureReasonCode).toBeUndefined();
    expect(JSON.stringify(pub.body)).not.toContain('secret-provider-ref');

    const bySlug = await request(app).get(
      `/api/public/live-market/stores/${store.slug}/live-session`,
    );
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.session?.id).toBe(sched.body.session.id);
  });

  it('master flag gates all surfaces', async () => {
    process.env.ENABLE_LIVE_MARKET_V1 = 'false';
    const pub = await request(app).get('/api/public/live-market/sessions/x');
    expect(pub.status).toBe(403);
    expect(pub.body.error).toBe(LIVE_MARKET_ERROR_CODES.LIVE_MARKET_DISABLED);

    const adminHealth = await request(app)
      .get('/api/admin/live-market/health')
      .set(auth(adminToken));
    expect(adminHealth.status).toBe(403);

    const ownerList = await request(app)
      .get(`/api/stores/${store.id}/live-sessions`)
      .set(auth(ownerToken));
    expect(ownerList.status).toBe(403);

    process.env.ENABLE_LIVE_MARKET_V1 = 'true';
  });

  it('existing Product / Business reads remain available (regression smoke)', async () => {
    const products = await prisma.product.findMany({ where: { businessId: store.id } });
    expect(products.length).toBeGreaterThanOrEqual(2);
    const biz = await prisma.business.findUnique({ where: { id: store.id } });
    expect(biz?.slug).toBeTruthy();
  });
});
