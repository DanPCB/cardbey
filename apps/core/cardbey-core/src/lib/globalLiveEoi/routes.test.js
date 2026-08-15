/**
 * Global Live EOI route tests — mocked Prisma + auth (no Live Market coupling).
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const store = new Map();

const mockPrisma = {
  globalLiveEoiRegistration: {
    findFirst: vi.fn(async ({ where }) => {
      const rows = [...store.values()].filter((r) => {
        if (where.pilotId && r.pilotId !== where.pilotId) return false;
        if (where.emailNormalized && r.emailNormalized !== where.emailNormalized) return false;
        if (where.createdAt?.gte && new Date(r.createdAt) < where.createdAt.gte) return false;
        return true;
      });
      rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return rows[0] || null;
    }),
    create: vi.fn(async ({ data }) => {
      const row = {
        id: `eoi_${store.size + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: data.status || 'SUBMITTED',
        ...data,
      };
      store.set(row.id, row);
      return { ...row };
    }),
    findMany: vi.fn(async ({ where, take, skip }) => {
      let rows = [...store.values()];
      if (where?.pilotId) rows = rows.filter((r) => r.pilotId === where.pilotId);
      if (where?.status) rows = rows.filter((r) => r.status === where.status);
      rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return rows.slice(skip || 0, (skip || 0) + (take || 50));
    }),
    count: vi.fn(async ({ where } = {}) => {
      let rows = [...store.values()];
      if (where?.pilotId) rows = rows.filter((r) => r.pilotId === where.pilotId);
      if (where?.status) rows = rows.filter((r) => r.status === where.status);
      return rows.length;
    }),
    groupBy: vi.fn(async ({ where } = {}) => {
      let rows = [...store.values()];
      if (where?.pilotId) rows = rows.filter((r) => r.pilotId === where.pilotId);
      const map = new Map();
      for (const r of rows) map.set(r.status, (map.get(r.status) || 0) + 1);
      return [...map.entries()].map(([status, n]) => ({ status, _count: { _all: n } }));
    }),
    findUnique: vi.fn(async ({ where }) => (store.has(where.id) ? { ...store.get(where.id) } : null)),
    update: vi.fn(async ({ where, data }) => {
      const row = store.get(where.id);
      if (!row) throw Object.assign(new Error('not found'), { code: 'P2025' });
      const next = { ...row, ...data, updatedAt: new Date() };
      store.set(where.id, next);
      return { ...next };
    }),
  },
};

vi.mock('../prisma.js', () => ({
  getPrismaClient: () => mockPrisma,
}));

vi.mock('../../middleware/auth.js', () => ({
  optionalAuth: (req, _res, next) => {
    const uid = req.headers['x-test-user-id'];
    if (uid) {
      req.userId = String(uid);
      req.user = { id: String(uid), role: 'owner' };
    }
    next();
  },
  requireAuth: (req, res, next) => {
    const uid = req.headers['x-test-user-id'];
    if (!uid) return res.status(401).json({ ok: false, error: 'Not authenticated' });
    req.userId = String(uid);
    req.user = {
      id: String(uid),
      role: req.headers['x-test-admin'] === '1' ? 'platform_admin' : 'owner',
    };
    next();
  },
  requireAdmin: (req, res, next) => {
    if (req.headers['x-test-admin'] !== '1') {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    next();
  },
}));

const { globalLiveEoiPublicRoutes, globalLiveEoiAdminRoutes } = await import('./routes.js');

const FLAG_KEYS = ['ENABLE_GLOBAL_LIVE_EOI_V1', 'GLOBAL_LIVE_EOI_OPEN'];

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/public/global-live', globalLiveEoiPublicRoutes);
  app.use('/api/admin/global-live', globalLiveEoiAdminRoutes);
  return app;
}

function validBody(overrides = {}) {
  return {
    name: 'Nguyen Lan',
    businessName: 'Lan Specialty Coffee',
    industry: 'Cafe',
    city: 'Ho Chi Minh',
    country: 'Vietnam',
    phone: '+84 912 345 678',
    email: 'lan@example.com',
    showcaseTypes: ['products', 'business_story'],
    businessDescription: 'Roastery and cafe',
    existingCardbeyBusiness: 'no',
    consentGranted: true,
    utmSource: 'facebook',
    utmMedium: 'social',
    utmCampaign: 'global_live_v1',
    language: 'vi',
    ...overrides,
  };
}

describe('globalLiveEoi routes', () => {
  const backup = {};
  let app;

  beforeEach(() => {
    for (const k of FLAG_KEYS) backup[k] = process.env[k];
    store.clear();
    vi.clearAllMocks();
    process.env.ENABLE_GLOBAL_LIVE_EOI_V1 = 'true';
    process.env.GLOBAL_LIVE_EOI_OPEN = 'true';
    app = buildApp();
  });

  afterEach(() => {
    for (const k of FLAG_KEYS) {
      if (backup[k] === undefined) delete process.env[k];
      else process.env[k] = backup[k];
    }
  });

  it('rejects when feature disabled', async () => {
    delete process.env.ENABLE_GLOBAL_LIVE_EOI_V1;
    const res = await request(app).post('/api/public/global-live/registrations').send(validBody());
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('GLOBAL_LIVE_EOI_DISABLED');
  });

  it('rejects when registration closed', async () => {
    process.env.GLOBAL_LIVE_EOI_OPEN = 'false';
    const res = await request(app).post('/api/public/global-live/registrations').send(validBody());
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('GLOBAL_LIVE_EOI_CLOSED');
  });

  it('requires consent and returns field keys without PII', async () => {
    const res = await request(app)
      .post('/api/public/global-live/registrations')
      .send(validBody({ consentGranted: false }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('GLOBAL_LIVE_EOI_VALIDATION');
    expect(res.body.fields).toContain('consentGranted');
    expect(JSON.stringify(res.body)).not.toContain('lan@example.com');
  });

  it('submits successfully and captures attribution + pilotId', async () => {
    const res = await request(app)
      .post('/api/public/global-live/registrations')
      .set('x-test-user-id', 'user_1')
      .send(validBody({ storeId: 'store_should_bind' }));
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
    expect(store.size).toBe(1);
    const row = [...store.values()][0];
    expect(row.pilotId).toBe('vn_au_global_live_v1');
    expect(row.utmSource).toBe('facebook');
    expect(row.utmMedium).toBe('social');
    expect(row.utmCampaign).toBe('global_live_v1');
    expect(row.userId).toBe('user_1');
    expect(row.storeId).toBe('store_should_bind');
    expect(row.emailNormalized).toBe('lan@example.com');
    expect(row.phone).toBe('+84912345678');
  });

  it('does not bind storeId without session; soft-dedupes same email', async () => {
    const first = await request(app)
      .post('/api/public/global-live/registrations')
      .send(validBody({ storeId: 'orphan_store' }));
    expect(first.status).toBe(201);
    expect([...store.values()][0].storeId).toBeNull();

    const second = await request(app)
      .post('/api/public/global-live/registrations')
      .send(validBody({ businessName: 'Changed Name' }));
    expect(second.status).toBe(201);
    expect(second.body).toEqual({ ok: true });
    expect(store.size).toBe(1);
  });

  it('public config returns pilot without records', async () => {
    const res = await request(app).get('/api/public/global-live/config');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.open).toBe(true);
    expect(res.body.pilot.id).toBe('vn_au_global_live_v1');
    expect(res.body.pilot.capacitySelected).toBe(20);
  });

  it('admin list requires platform admin', async () => {
    await request(app).post('/api/public/global-live/registrations').send(validBody());

    const denied = await request(app)
      .get('/api/admin/global-live/registrations')
      .set('x-test-user-id', 'owner_1');
    expect(denied.status).toBe(403);

    const ok = await request(app)
      .get('/api/admin/global-live/registrations')
      .set('x-test-user-id', 'admin_1')
      .set('x-test-admin', '1');
    expect(ok.status).toBe(200);
    expect(ok.body.total).toBe(1);
    expect(ok.body.counts.SUBMITTED).toBe(1);
    expect(ok.body.items[0].businessName).toBe('Lan Specialty Coffee');
  });

  it('admin can update status', async () => {
    await request(app).post('/api/public/global-live/registrations').send(validBody());
    const id = [...store.keys()][0];

    const res = await request(app)
      .patch(`/api/admin/global-live/registrations/${id}`)
      .set('x-test-user-id', 'admin_1')
      .set('x-test-admin', '1')
      .send({ status: 'SHORTLISTED' });
    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe('SHORTLISTED');
  });
});
