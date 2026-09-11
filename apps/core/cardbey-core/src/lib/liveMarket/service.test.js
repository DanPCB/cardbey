/**
 * Live Market Batch B — service + route authorization tests (mocked Prisma).
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Features } from '../../config/features.js';
import { LIVE_MARKET_ERROR_CODES, LIVE_PROVIDER_READINESS } from './domain.js';
import { FakeLiveVideoProvider } from './providers.js';
import {
  assertOwnerPilotAccess,
  createEnrollment,
  createSession,
  getOwnerLiveMarketStatus,
  prepareSession,
  startSession,
  scheduleSession,
  setSessionSubjects,
  transitionEnrollment,
  toOwnerSessionDto,
  getPublicSession,
} from './service.js';

const FLAG_KEYS = [
  'ENABLE_LIVE_MARKET_V1',
  'ENABLE_LIVE_MARKET_ADMIN_V1',
  'ENABLE_LIVE_MARKET_OWNER_V1',
  'ENABLE_LIVE_MARKET_PUBLIC_V1',
  'LIVE_MARKET_ALLOW_FAKE_PROVIDER',
];

function makePrismaMock(overrides = {}) {
  const enrollmentStore = new Map();
  const sessionStore = new Map();
  const subjectStore = new Map();
  const products = new Map();
  const businesses = new Map();
  const audits = [];

  const prisma = {
    business: {
      findUnique: vi.fn(async ({ where }) => businesses.get(where.id) || null),
    },
    product: {
      findFirst: vi.fn(async ({ where, select }) => {
        const p = products.get(where.id) || null;
        if (!p) return null;
        if (select?.itemType && !('itemType' in p)) return { itemType: null };
        return p;
      }),
      findMany: vi.fn(async ({ where }) => {
        const ids = where?.id?.in || [];
        return ids.map((id) => products.get(id)).filter(Boolean);
      }),
    },
    liveMarketPilotEnrollment: {
      findUnique: vi.fn(async ({ where }) => {
        if (where.storeId) {
          for (const row of enrollmentStore.values()) {
            if (row.storeId === where.storeId) return { ...row };
          }
          return null;
        }
        return enrollmentStore.get(where.id) ? { ...enrollmentStore.get(where.id) } : null;
      }),
      findMany: vi.fn(async () => [...enrollmentStore.values()]),
      create: vi.fn(async ({ data }) => {
        const row = {
          id: data.id || `enr_${enrollmentStore.size + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        enrollmentStore.set(row.id, row);
        return { ...row };
      }),
      update: vi.fn(async ({ where, data }) => {
        const row = enrollmentStore.get(where.id);
        const next = { ...row, ...data, updatedAt: new Date() };
        enrollmentStore.set(where.id, next);
        return { ...next };
      }),
    },
    liveMarketSession: {
      findMany: vi.fn(async ({ where }) =>
        [...sessionStore.values()].filter((s) => !where?.storeId || s.storeId === where.storeId),
      ),
      findFirst: vi.fn(async ({ where }) => {
        const row = [...sessionStore.values()].find(
          (s) => s.id === where.id && (!where.storeId || s.storeId === where.storeId),
        );
        if (!row) return null;
        return {
          ...row,
          subjects: [...subjectStore.values()].filter((x) => x.sessionId === row.id),
        };
      }),
      findUnique: vi.fn(async ({ where }) => {
        const row = sessionStore.get(where.id);
        if (!row) return null;
        return {
          ...row,
          subjects: [...subjectStore.values()].filter((x) => x.sessionId === row.id),
          store: businesses.get(row.storeId),
        };
      }),
      create: vi.fn(async ({ data }) => {
        const row = {
          id: `sess_${sessionStore.size + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
          providerExternalRef: null,
          startedAt: null,
          endedAt: null,
          endReasonCode: null,
          failureReasonCode: null,
          scheduledStartAt: null,
          ...data,
          subjects: [],
        };
        sessionStore.set(row.id, row);
        return { ...row, subjects: [] };
      }),
      update: vi.fn(async ({ where, data }) => {
        const row = sessionStore.get(where.id);
        const next = { ...row };
        for (const [k, v] of Object.entries(data)) {
          if (k === 'version' && v && typeof v === 'object' && v.increment) {
            next.version = (next.version || 1) + v.increment;
          } else {
            next[k] = v;
          }
        }
        next.updatedAt = new Date();
        sessionStore.set(where.id, next);
        return {
          ...next,
          subjects: [...subjectStore.values()].filter((x) => x.sessionId === next.id),
        };
      }),
    },
    liveMarketSessionSubject: {
      deleteMany: vi.fn(async ({ where }) => {
        for (const [id, s] of [...subjectStore.entries()]) {
          if (s.sessionId === where.sessionId) subjectStore.delete(id);
        }
      }),
      createMany: vi.fn(async ({ data }) => {
        for (const row of data) {
          const id = `sub_${subjectStore.size + 1}`;
          subjectStore.set(id, { id, createdAt: new Date(), ...row });
        }
      }),
    },
    auditEvent: {
      create: vi.fn(async ({ data }) => {
        audits.push(data);
        return { id: `aud_${audits.length}`, ...data };
      }),
    },
    $transaction: vi.fn(async (fn) => fn(prisma)),
    _enrollmentStore: enrollmentStore,
    _sessionStore: sessionStore,
    _subjectStore: subjectStore,
    _products: products,
    _businesses: businesses,
    _audits: audits,
    ...overrides,
  };
  return prisma;
}

describe('liveMarket service (Batch B)', () => {
  const envBackup = {};

  beforeEach(() => {
    for (const k of FLAG_KEYS) {
      envBackup[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of FLAG_KEYS) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    }
  });

  it('creates enrolment and transitions ACTIVE → PAUSED with audit', async () => {
    const prisma = makePrismaMock();
    prisma._businesses.set('store1', { id: 'store1', userId: 'owner1', name: 'Demo', isActive: true });
    const enr = await createEnrollment({
      prisma,
      storeId: 'store1',
      actorId: 'admin1',
      state: 'ACTIVE',
    });
    expect(enr.state).toBe('ACTIVE');
    const paused = await transitionEnrollment({
      prisma,
      enrollmentId: enr.id,
      toState: 'PAUSED',
      actorId: 'admin1',
    });
    expect(paused.state).toBe('PAUSED');
    expect(prisma._audits.some((a) => a.entityType === 'LiveMarketPilotEnrollment')).toBe(true);
  });

  it('blocks prepare when enrolment is PAUSED', async () => {
    const prisma = makePrismaMock();
    prisma._businesses.set('store1', { id: 'store1', userId: 'owner1', name: 'Demo', isActive: true });
    await createEnrollment({ prisma, storeId: 'store1', actorId: 'a', state: 'ACTIVE' });
    const enr = [...prisma._enrollmentStore.values()][0];
    await transitionEnrollment({
      prisma,
      enrollmentId: enr.id,
      toState: 'PAUSED',
      actorId: 'a',
    });
    await expect(
      assertOwnerPilotAccess({
        prisma,
        storeId: 'store1',
        userId: 'owner1',
        action: 'prepare',
      }),
    ).rejects.toMatchObject({ code: LIVE_MARKET_ERROR_CODES.LIVE_ENROLLMENT_NOT_ACTIVE });
  });

  it('rejects non-owner host', async () => {
    const prisma = makePrismaMock();
    prisma._businesses.set('store1', { id: 'store1', userId: 'owner1', name: 'Demo', isActive: true });
    await createEnrollment({ prisma, storeId: 'store1', actorId: 'a', state: 'ACTIVE' });
    await expect(
      createSession({
        prisma,
        storeId: 'store1',
        hostUserId: 'other',
        title: 'Nope',
      }),
    ).rejects.toMatchObject({ code: LIVE_MARKET_ERROR_CODES.LIVE_HOST_NOT_AUTHORIZED });
  });

  it('getOwnerLiveMarketStatus: enrolled ACTIVE, paused, removed, and non-enrolled', async () => {
    const prisma = makePrismaMock();
    prisma._businesses.set('store1', { id: 'store1', userId: 'owner1', name: 'Demo', isActive: true });

    const none = await getOwnerLiveMarketStatus({
      prisma,
      storeId: 'store1',
      userId: 'owner1',
    });
    expect(none.enrolled).toBe(false);
    expect(none.capabilities.canCreateDraft).toBe(false);
    expect(none.providerReadiness).toBe(LIVE_PROVIDER_READINESS.NOT_CONFIGURED);
    expect(none.streamingOperational).toBe(false);

    await createEnrollment({ prisma, storeId: 'store1', actorId: 'a', state: 'ACTIVE' });
    const active = await getOwnerLiveMarketStatus({
      prisma,
      storeId: 'store1',
      userId: 'owner1',
    });
    expect(active.enrollmentState).toBe('ACTIVE');
    expect(active.capabilities.canSchedule).toBe(true);
    expect(active.capabilities.canPrepare).toBe(false);
    expect(JSON.stringify(active)).not.toMatch(/ActorId|approvedHost/i);

    const enr = [...prisma._enrollmentStore.values()][0];
    await transitionEnrollment({
      prisma,
      enrollmentId: enr.id,
      toState: 'PAUSED',
      actorId: 'a',
    });
    const paused = await getOwnerLiveMarketStatus({
      prisma,
      storeId: 'store1',
      userId: 'owner1',
    });
    expect(paused.enrollmentState).toBe('PAUSED');
    expect(paused.capabilities.canEditDraft).toBe(true);
    expect(paused.capabilities.canCancel).toBe(true);
    expect(paused.capabilities.canSchedule).toBe(false);

    await transitionEnrollment({
      prisma,
      enrollmentId: enr.id,
      toState: 'REMOVED',
      actorId: 'a',
    });
    const removed = await getOwnerLiveMarketStatus({
      prisma,
      storeId: 'store1',
      userId: 'owner1',
    });
    expect(removed.enrollmentState).toBe('REMOVED');
    expect(removed.capabilities.canCreateDraft).toBe(false);
    expect(removed.capabilities.canCancel).toBe(false);

    await expect(
      getOwnerLiveMarketStatus({
        prisma,
        storeId: 'store1',
        userId: 'other',
      }),
    ).rejects.toMatchObject({ code: LIVE_MARKET_ERROR_CODES.LIVE_HOST_NOT_AUTHORIZED });
  });

  it('happy path create → schedule and prepare fails without provider', async () => {
    const prisma = makePrismaMock();
    prisma._businesses.set('store1', { id: 'store1', userId: 'owner1', name: 'Demo', isActive: true });
    await createEnrollment({ prisma, storeId: 'store1', actorId: 'a', state: 'ACTIVE' });
    const session = await createSession({
      prisma,
      storeId: 'store1',
      hostUserId: 'owner1',
      title: 'VI live',
    });
    expect(session.state).toBe('DRAFT');
    const scheduled = await scheduleSession({
      prisma,
      storeId: 'store1',
      sessionId: session.id,
      hostUserId: 'owner1',
      scheduledStartAt: '2026-08-20T10:00:00.000Z',
    });
    expect(scheduled.state).toBe('SCHEDULED');
    await expect(
      prepareSession({
        prisma,
        storeId: 'store1',
        sessionId: session.id,
        hostUserId: 'owner1',
      }),
    ).rejects.toMatchObject({ code: LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED });
  });

  it('prepare succeeds with explicit FakeLiveVideoProvider (tests only)', async () => {
    const prisma = makePrismaMock();
    prisma._businesses.set('store1', { id: 'store1', userId: 'owner1', name: 'Demo', isActive: true });
    await createEnrollment({ prisma, storeId: 'store1', actorId: 'a', state: 'ACTIVE' });
    const session = await createSession({
      prisma,
      storeId: 'store1',
      hostUserId: 'owner1',
      title: 'VI live',
    });
    await scheduleSession({
      prisma,
      storeId: 'store1',
      sessionId: session.id,
      hostUserId: 'owner1',
    });
    const ready = await prepareSession({
      prisma,
      storeId: 'store1',
      sessionId: session.id,
      hostUserId: 'owner1',
      videoProvider: new FakeLiveVideoProvider(),
    });
    expect(ready.state).toBe('READY');
    expect(ready.providerExternalRef).toMatch(/^fake:/);
  });

  it('startSession records CONNECTING until provider evidence confirms LIVE', async () => {
    const prisma = makePrismaMock();
    prisma._businesses.set('store1', { id: 'store1', userId: 'owner1', name: 'Demo', isActive: true });
    await createEnrollment({ prisma, storeId: 'store1', actorId: 'a', state: 'ACTIVE' });
    const provider = new FakeLiveVideoProvider();
    const session = await createSession({
      prisma,
      storeId: 'store1',
      hostUserId: 'owner1',
      title: 'VI live',
    });
    await scheduleSession({
      prisma,
      storeId: 'store1',
      sessionId: session.id,
      hostUserId: 'owner1',
    });
    await prepareSession({
      prisma,
      storeId: 'store1',
      sessionId: session.id,
      hostUserId: 'owner1',
      videoProvider: provider,
    });
    const connecting = await startSession({
      prisma,
      storeId: 'store1',
      sessionId: session.id,
      hostUserId: 'owner1',
      videoProvider: provider,
    });
    expect(connecting.state).toBe('CONNECTING');
    expect(connecting.startedAt).toBeNull();
  });

  it('validates subjects against Product.businessId and accepts PRODUCT+SERVICE', async () => {
    const prisma = makePrismaMock();
    prisma._businesses.set('store1', { id: 'store1', userId: 'owner1', name: 'Demo', isActive: true });
    prisma._products.set('p1', {
      id: 'p1',
      businessId: 'store1',
      deletedAt: null,
      itemType: 'product',
    });
    prisma._products.set('s1', {
      id: 's1',
      businessId: 'store1',
      deletedAt: null,
      itemType: 'service',
    });
    prisma._products.set('x1', {
      id: 'x1',
      businessId: 'other',
      deletedAt: null,
      itemType: 'product',
    });
    await createEnrollment({ prisma, storeId: 'store1', actorId: 'a', state: 'ACTIVE' });
    const session = await createSession({
      prisma,
      storeId: 'store1',
      hostUserId: 'owner1',
      title: 'Subjects',
    });
    const ok = await setSessionSubjects({
      prisma,
      storeId: 'store1',
      sessionId: session.id,
      hostUserId: 'owner1',
      subjects: [
        { subjectType: 'PRODUCT', subjectId: 'p1' },
        { subjectType: 'SERVICE', subjectId: 's1' },
      ],
    });
    expect(ok.subjects).toHaveLength(2);
    await expect(
      setSessionSubjects({
        prisma,
        storeId: 'store1',
        sessionId: session.id,
        hostUserId: 'owner1',
        subjects: [{ subjectType: 'PRODUCT', subjectId: 'x1' }],
      }),
    ).rejects.toMatchObject({ code: LIVE_MARKET_ERROR_CODES.LIVE_SUBJECT_STORE_MISMATCH });
  });

  it('public DTO excludes drafts and internal fields; requires publication', async () => {
    const prisma = makePrismaMock();
    prisma._businesses.set('store1', {
      id: 'store1',
      userId: 'owner1',
      name: 'Demo',
      slug: 'demo',
      isActive: true,
    });
    prisma._enrollmentStore.set('enr1', {
      id: 'enr1',
      storeId: 'store1',
      state: 'ACTIVE',
    });
    prisma._sessionStore.set('sess_draft', {
      id: 'sess_draft',
      storeId: 'store1',
      hostUserId: 'owner1',
      title: 'secret',
      state: 'DRAFT',
      storefrontPublicationStatus: 'HIDDEN',
      providerExternalRef: 'secret-ref',
      failureReasonCode: 'x',
    });
    await expect(getPublicSession({ prisma, sessionId: 'sess_draft' })).rejects.toMatchObject({
      code: LIVE_MARKET_ERROR_CODES.LIVE_SESSION_NOT_FOUND,
    });

    prisma._sessionStore.set('sess_pub', {
      id: 'sess_pub',
      storeId: 'store1',
      hostUserId: 'owner1',
      title: 'Live',
      description: null,
      sourceLanguage: 'vi',
      viewerLanguages: ['en'],
      scheduledStartAt: '2030-01-01T00:00:00.000Z',
      startedAt: null,
      endedAt: null,
      state: 'SCHEDULED',
      storefrontPublicationStatus: 'PUBLISHED',
      providerExternalRef: 'secret-ref',
      failureReasonCode: 'x',
    });
    const dto = await getPublicSession({ prisma, sessionId: 'sess_pub' });
    expect(dto.hostUserId).toBeUndefined();
    expect(dto.providerExternalRef).toBeUndefined();
    expect(dto.failureReasonCode).toBeUndefined();
    expect(dto.state).toBe('SCHEDULED');
    expect(dto.providerConfirmedLive).toBe(false);
    expect(toOwnerSessionDto({ ...prisma._sessionStore.get('sess_pub'), subjects: [] }).providerConfigured).toBe(
      false,
    );
  });
});

describe('liveMarket routes flag gates', () => {
  const envBackup = {};

  beforeEach(() => {
    for (const k of FLAG_KEYS) {
      envBackup[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of FLAG_KEYS) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    }
    vi.resetModules();
  });

  it('returns LIVE_MARKET_DISABLED when flags off', async () => {
    const { liveMarketPublicRoutes, liveMarketAdminRoutes, liveMarketOwnerRoutes } = await import(
      './routes.js'
    );
    const app = express();
    app.use(express.json());
    app.use('/api/public/live-market', liveMarketPublicRoutes);
    app.use('/api/admin/live-market', liveMarketAdminRoutes);
    app.use('/api/stores', liveMarketOwnerRoutes);

    expect(Features.liveMarket.v1).toBe(false);
    const pub = await request(app).get('/api/public/live-market/sessions/x');
    expect(pub.status).toBe(403);
    expect(pub.body.error).toBe(LIVE_MARKET_ERROR_CODES.LIVE_MARKET_DISABLED);

    const admin = await request(app).get('/api/admin/live-market/health');
    expect(admin.status).toBe(403);
    expect(admin.body.error).toBe(LIVE_MARKET_ERROR_CODES.LIVE_MARKET_DISABLED);

    const status = await request(app).get('/api/stores/store1/live-market/status');
    expect(status.status).toBe(403);
    expect(status.body.error).toBe(LIVE_MARKET_ERROR_CODES.LIVE_MARKET_DISABLED);
  });

  it('admin health works when master+admin flags on (still requires auth)', async () => {
    process.env.ENABLE_LIVE_MARKET_V1 = 'true';
    process.env.ENABLE_LIVE_MARKET_ADMIN_V1 = 'true';
    vi.resetModules();
    const { liveMarketAdminRoutes } = await import('./routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/admin/live-market', liveMarketAdminRoutes);
    const res = await request(app).get('/api/admin/live-market/health');
    // requireAuth runs after flag gates — unauthenticated → 401
    expect([401, 403]).toContain(res.status);
  });
});
