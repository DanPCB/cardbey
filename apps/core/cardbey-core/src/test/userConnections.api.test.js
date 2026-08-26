import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

import {
  canonicalizePhoneE164,
  hmacIdentifier,
} from '../lib/contactSyncHash.js';
import { syncUserPhoneIdentifier } from '../lib/userIdentifierSync.js';
import { importLegacyAcceptedConnections } from '../services/connections/userConnectionService.js';

import { PrismaClient as PrismaClientGen } from '../../node_modules/.prisma/client-gen/index.js';

const prisma = new PrismaClientGen();

vi.mock('../lib/prisma.js', async () => {
  return {
    PrismaClient: PrismaClientGen,
    getPrismaClient: () => prisma,
    disconnectDatabase: async () => {},
    default: prisma,
    prisma,
  };
});

const { generateGuestToken, generateToken } = await import('../middleware/auth.js');
const connectionRoutes = (await import('../routes/connectionRoutes.js')).default;

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', connectionRoutes);
  app.use((_req, res) => res.status(404).json({ ok: false, error: 'not_found' }));
  return app;
}

async function createUser(overrides = {}) {
  const email = `u_${Math.random().toString(16).slice(2)}@example.com`;
  return prisma.user.create({
    data: {
      email,
      passwordHash: 'test',
      emailVerified: true,
      ...overrides,
    },
    select: { id: true, email: true, phone: true },
  });
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

const SECRET = 'test-contact-sync-hmac-secret';

beforeAll(async () => {
  await prisma.user.count();
});

beforeEach(() => {
  process.env.CONTACT_SYNC_HMAC_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.CONTACT_SYNC_HMAC_SECRET;
});

describe('Phase A — phone UserIdentifier seeding', () => {
  it('seeds E.164 phone hash and clears on null', async () => {
    const user = await createUser({ phone: '+61400111222' });
    const r1 = await syncUserPhoneIdentifier(prisma, { userId: user.id, phone: user.phone });
    expect(r1.seeded).toBe(true);

    const canon = canonicalizePhoneE164('+61400111222');
    const hash = hmacIdentifier('phone', canon);
    const row = await prisma.userIdentifier.findFirst({
      where: { userId: user.id, kind: 'phone', hash },
    });
    expect(row?.source).toBe('profile');

    const r2 = await syncUserPhoneIdentifier(prisma, { userId: user.id, phone: null });
    expect(r2.cleared).toBe(true);
    const after = await prisma.userIdentifier.findFirst({
      where: { userId: user.id, kind: 'phone', source: 'profile' },
    });
    expect(after).toBeNull();
  });

  it('does not seed non-E.164 phones', async () => {
    const user = await createUser();
    const r = await syncUserPhoneIdentifier(prisma, { userId: user.id, phone: '0400 111 222' });
    expect(r.seeded).toBe(false);
    expect(r.reason).toBe('not_e164');
  });
});

describe('Phase B — /api/connections', () => {
  it('rejects guests', async () => {
    const app = buildApp();
    const { token } = generateGuestToken();
    const res = await request(app)
      .post('/api/connections')
      .set(authHeader(token))
      .send({ toUserId: 'x' });
    expect(res.status).toBe(403);
  });

  it('create → accept → list accepted', async () => {
    const app = buildApp();
    const a = await createUser();
    const b = await createUser();
    const tokenA = generateToken(a.id);
    const tokenB = generateToken(b.id);

    const create = await request(app)
      .post('/api/connections')
      .set(authHeader(tokenA))
      .send({ toUserId: b.id });
    expect(create.status).toBe(201);
    expect(create.body?.connection?.status).toBe('pending');
    const connectionId = create.body.connection.id;

    const accept = await request(app)
      .post(`/api/connections/${connectionId}/accept`)
      .set(authHeader(tokenB))
      .send({});
    expect(accept.status).toBe(200);
    expect(accept.body?.connection?.status).toBe('accepted');

    const list = await request(app)
      .get('/api/connections?status=accepted')
      .set(authHeader(tokenA));
    expect(list.status).toBe(200);
    expect(list.body.connections.some((c) => c.id === connectionId)).toBe(true);
  });

  it('rejects self-connect', async () => {
    const app = buildApp();
    const a = await createUser();
    const tokenA = generateToken(a.id);
    const res = await request(app)
      .post('/api/connections')
      .set(authHeader(tokenA))
      .send({ toUserId: a.id });
    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('SELF_CONNECT');
  });

  it('recipient-only accept', async () => {
    const app = buildApp();
    const a = await createUser();
    const b = await createUser();
    const tokenA = generateToken(a.id);

    const create = await request(app)
      .post('/api/connections')
      .set(authHeader(tokenA))
      .send({ toUserId: b.id });
    const connectionId = create.body.connection.id;

    const bad = await request(app)
      .post(`/api/connections/${connectionId}/accept`)
      .set(authHeader(tokenA))
      .send({});
    expect(bad.status).toBe(403);
  });
});

describe('Phase C — legacy import', () => {
  it('imports accepted pairs idempotently', async () => {
    const a = await createUser();
    const b = await createUser();
    const stats1 = await importLegacyAcceptedConnections(prisma, [
      { fromUserId: a.id, toUserId: b.id },
    ]);
    expect(stats1.created).toBe(1);

    const stats2 = await importLegacyAcceptedConnections(prisma, [
      { fromUserId: a.id, toUserId: b.id },
      { fromUserId: b.id, toUserId: a.id },
    ]);
    expect(stats2.created).toBe(0);
    expect(stats2.skipped).toBe(2);

    const row = await prisma.userConnection.findFirst({
      where: {
        OR: [
          { fromUserId: a.id, toUserId: b.id },
          { fromUserId: b.id, toUserId: a.id },
        ],
        status: 'accepted',
        source: 'legacy_import',
      },
    });
    expect(row).toBeTruthy();
  });

  it('dry-run does not write', async () => {
    const a = await createUser();
    const b = await createUser();
    const stats = await importLegacyAcceptedConnections(
      prisma,
      [{ fromUserId: a.id, toUserId: b.id }],
      { dryRun: true },
    );
    expect(stats.created).toBe(1);
    const count = await prisma.userConnection.count({
      where: {
        OR: [
          { fromUserId: a.id, toUserId: b.id },
          { fromUserId: b.id, toUserId: a.id },
        ],
      },
    });
    expect(count).toBe(0);
  });
});
