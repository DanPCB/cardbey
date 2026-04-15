import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

import { canonicalizeEmail, getContactSyncHashVersion, hmacIdentifier } from '../lib/contactSyncHash.js';

// IMPORTANT: Core runtime uses `@prisma/client` (default output), but tests generate the SQLite client
// to `node_modules/.prisma/client-gen`. Contact Sync models exist only in that generated client in CI/local.
// To avoid depending on dev-only Prisma state (and Windows file locking during default generate),
// we mock Core's prisma singleton to use client-gen for these API tests.
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
const contactsSyncRoutes = (await import('../routes/contactsSyncRoutes.js')).default;

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', contactsSyncRoutes);
  // Minimal 404 to match prod shape
  app.use((_req, res) => res.status(404).json({ ok: false, error: 'not_found' }));
  return app;
}

async function createUser({ emailVerified, createdAtMsOffset = 0 } = {}) {
  const now = Date.now();
  const createdAt = new Date(now - createdAtMsOffset);
  const email = `u_${Math.random().toString(16).slice(2)}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'test',
      emailVerified: Boolean(emailVerified),
      createdAt,
      updatedAt: createdAt,
    },
    select: { id: true, email: true, emailVerified: true, createdAt: true },
  });
  return user;
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

const SECRET = 'test-contact-sync-hmac-secret';

beforeAll(async () => {
  // Ensure tables exist in test DB (pretest runs db push already); but keep this as a safety net for local runs.
  await prisma.user.count();
});

beforeEach(() => {
  process.env.CONTACT_SYNC_HMAC_SECRET = SECRET;
});

afterEach(() => {
  // Avoid leaking env changes between tests
  delete process.env.CONTACT_SYNC_HMAC_SECRET;
});

describe('Contact Sync Phase 1 — GO/NO-GO API tests', () => {
  describe('A. Auth / identity gates', () => {
    it('1. guest token cannot create a contact sync session', async () => {
      const app = buildApp();
      const { token } = generateGuestToken();
      const res = await request(app)
        .post('/api/contacts-sync/sessions')
        .set(authHeader(token))
        .send({ platform: 'android' });
      expect(res.status).toBe(403);
      expect(res.body?.ok).toBe(false);
    });

    it('2. guest token cannot upload identifiers', async () => {
      const app = buildApp();
      const { token } = generateGuestToken();
      const res = await request(app)
        .post('/api/contacts-sync/sessions/any/identifiers')
        .set(authHeader(token))
        .set('x-contacts-sync-token', 'nope')
        .send({ identifiers: [{ kind: 'email', value: 'a@example.com' }] });
      expect(res.status).toBe(403);
      expect(res.body?.ok).toBe(false);
    });

    it('3. request with no auth is rejected', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/contacts-sync/sessions')
        .send({ platform: 'android' });
      expect(res.status).toBe(401);
      expect(res.body?.ok).toBe(false);
    });

    it('4. DB-backed authenticated user can create a session', async () => {
      const app = buildApp();
      const user = await createUser({ emailVerified: true });
      const token = generateToken(user.id);
      const res = await request(app)
        .post('/api/contacts-sync/sessions')
        .set(authHeader(token))
        .send({ platform: 'android' });
      expect(res.status).toBe(201);
      expect(res.body?.ok).toBe(true);
      expect(typeof res.body?.sessionId).toBe('string');
      expect(typeof res.body?.uploadToken).toBe('string');
      expect(res.body?.hashVersion).toBe(getContactSyncHashVersion());
    });

    it('5. account neither verified nor old enough is rejected (gate enabled)', async () => {
      const app = buildApp();
      const user = await createUser({ emailVerified: false, createdAtMsOffset: 0 });
      const token = generateToken(user.id);
      const res = await request(app)
        .post('/api/contacts-sync/sessions')
        .set(authHeader(token))
        .send({ platform: 'android' });
      expect(res.status).toBe(403);
      expect(res.body?.code).toBe('ACCOUNT_NOT_VERIFIED');
    });
  });

  describe('B. Ownership / isolation', () => {
    it('6. user A cannot upload to user B’s session', async () => {
      const app = buildApp();
      const userA = await createUser({ emailVerified: true, createdAtMsOffset: 20 * 60 * 1000 });
      const userB = await createUser({ emailVerified: true, createdAtMsOffset: 20 * 60 * 1000 });
      const tokenA = generateToken(userA.id);
      const tokenB = generateToken(userB.id);

      const sessionB = await request(app)
        .post('/api/contacts-sync/sessions')
        .set(authHeader(tokenB))
        .send({ platform: 'android' });
      expect(sessionB.status).toBe(201);

      const res = await request(app)
        .post(`/api/contacts-sync/sessions/${sessionB.body.sessionId}/identifiers`)
        .set(authHeader(tokenA))
        .set('x-contacts-sync-token', sessionB.body.uploadToken)
        .send({ identifiers: [{ kind: 'email', value: 'x@example.com' }] });
      // Route intentionally returns not found to avoid leaking existence across users
      expect(res.status).toBe(404);
    });

    it('7. user A cannot read results for user B’s session', async () => {
      const app = buildApp();
      const userA = await createUser({ emailVerified: true, createdAtMsOffset: 20 * 60 * 1000 });
      const userB = await createUser({ emailVerified: true, createdAtMsOffset: 20 * 60 * 1000 });
      const tokenA = generateToken(userA.id);
      const tokenB = generateToken(userB.id);

      const sessionB = await request(app)
        .post('/api/contacts-sync/sessions')
        .set(authHeader(tokenB))
        .send({ platform: 'android' });
      expect(sessionB.status).toBe(201);

      const res = await request(app)
        .get(`/api/contacts-sync/sessions/${sessionB.body.sessionId}/results`)
        .set(authHeader(tokenA));
      expect(res.status).toBe(404);
    });

    it('8. dismiss suggestion only works for owner', async () => {
      const app = buildApp();
      const userA = await createUser({ emailVerified: true, createdAtMsOffset: 20 * 60 * 1000 });
      const userB = await createUser({ emailVerified: true, createdAtMsOffset: 20 * 60 * 1000 });
      const tokenA = generateToken(userA.id);
      const tokenB = generateToken(userB.id);

      const sessionA = await request(app)
        .post('/api/contacts-sync/sessions')
        .set(authHeader(tokenA))
        .send({ platform: 'android' });
      expect(sessionA.status).toBe(201);

      // Create a match by creating a UserIdentifier for userB and uploading that email from userA.
      const canonEmailB = canonicalizeEmail(userB.email);
      const hash = hmacIdentifier('email', canonEmailB);
      const hv = getContactSyncHashVersion();
      await prisma.userIdentifier.create({
        data: { userId: userB.id, kind: 'email', hash, hashVersion: hv, source: 'email', verifiedAt: new Date() },
      });

      const upload = await request(app)
        .post(`/api/contacts-sync/sessions/${sessionA.body.sessionId}/identifiers`)
        .set(authHeader(tokenA))
        .set('x-contacts-sync-token', sessionA.body.uploadToken)
        .send({ identifiers: [{ kind: 'email', value: canonEmailB }] });
      expect(upload.status).toBe(200);

      const suggestion = await prisma.contactSuggestion.findFirst({
        where: { userId: userA.id, status: 'active' },
        select: { id: true },
      });
      expect(suggestion?.id).toBeTruthy();

      const res = await request(app)
        .post(`/api/contacts-sync/suggestions/${suggestion.id}/dismiss`)
        .set(authHeader(tokenB))
        .send({});
      expect(res.status).toBe(404);
    });

    it('9. revoke only affects owner’s data', async () => {
      const app = buildApp();
      const userA = await createUser({ emailVerified: true, createdAtMsOffset: 20 * 60 * 1000 });
      const userB = await createUser({ emailVerified: true, createdAtMsOffset: 20 * 60 * 1000 });
      const tokenA = generateToken(userA.id);
      const tokenB = generateToken(userB.id);

      const sessionA = await request(app)
        .post('/api/contacts-sync/sessions')
        .set(authHeader(tokenA))
        .send({ platform: 'android' });
      const sessionB = await request(app)
        .post('/api/contacts-sync/sessions')
        .set(authHeader(tokenB))
        .send({ platform: 'android' });

      expect(sessionA.status).toBe(201);
      expect(sessionB.status).toBe(201);

      const revokeA = await request(app)
        .post('/api/contacts-sync/revoke')
        .set(authHeader(tokenA))
        .send({});
      expect(revokeA.status).toBe(200);

      const srcA = await prisma.contactSyncSource.findUnique({ where: { id: sessionA.body.sessionId }, select: { status: true } });
      const srcB = await prisma.contactSyncSource.findUnique({ where: { id: sessionB.body.sessionId }, select: { status: true } });
      expect(srcA.status).toBe('disabled');
      expect(srcB.status).toBe('active');
    });

    it('10. delete is owner-scoped and idempotent', async () => {
      const app = buildApp();
      const userA = await createUser({ emailVerified: true, createdAtMsOffset: 20 * 60 * 1000 });
      const tokenA = generateToken(userA.id);

      const sessionA = await request(app)
        .post('/api/contacts-sync/sessions')
        .set(authHeader(tokenA))
        .send({ platform: 'android' });
      expect(sessionA.status).toBe(201);

      const del1 = await request(app)
        .delete('/api/contacts-sync/data')
        .set(authHeader(tokenA));
      expect(del1.status).toBe(200);
      expect(del1.body?.ok).toBe(true);

      const del2 = await request(app)
        .delete('/api/contacts-sync/data')
        .set(authHeader(tokenA));
      expect(del2.status).toBe(200);
      expect(del2.body?.ok).toBe(true);
    });
  });

  describe('C. Secret / config behavior', () => {
    it('11. missing CONTACT_SYNC_HMAC_SECRET fails closed with 503', async () => {
      const app = buildApp();
      delete process.env.CONTACT_SYNC_HMAC_SECRET;
      const user = await createUser({ emailVerified: true, createdAtMsOffset: 20 * 60 * 1000 });
      const token = generateToken(user.id);
      const res = await request(app)
        .post('/api/contacts-sync/sessions')
        .set(authHeader(token))
        .send({ platform: 'android' });
      expect(res.status).toBe(503);
      expect(res.body?.code).toBe('CONTACT_SYNC_NOT_CONFIGURED');
    });

    it('12. errors do not echo raw identifier values', async () => {
      const app = buildApp();
      const user = await createUser({ emailVerified: true, createdAtMsOffset: 20 * 60 * 1000 });
      const token = generateToken(user.id);
      const session = await request(app)
        .post('/api/contacts-sync/sessions')
        .set(authHeader(token))
        .send({ platform: 'android' });
      expect(session.status).toBe(201);

      const rawEmail = 'pii_echo_test@example.com';
      const res = await request(app)
        .post(`/api/contacts-sync/sessions/${session.body.sessionId}/identifiers`)
        .set(authHeader(token))
        .set('x-contacts-sync-token', 'bad-token')
        .send({ identifiers: [{ kind: 'email', value: rawEmail }] });
      expect(res.status).toBe(401);
      const bodyText = JSON.stringify(res.body || {});
      expect(bodyText.includes(rawEmail)).toBe(false);
    });
  });

  describe('D. API shape / anti-oracle', () => {
    it('13. no direct lookup endpoint exists for phone/email matching', async () => {
      const app = buildApp();
      const user = await createUser({ emailVerified: true, createdAtMsOffset: 20 * 60 * 1000 });
      const token = generateToken(user.id);

      const res1 = await request(app)
        .post('/api/contacts-sync/lookup-email')
        .set(authHeader(token))
        .send({ email: 'a@example.com' });
      expect(res1.status).toBe(404);

      const res2 = await request(app)
        .post('/api/contacts-sync/match-phone')
        .set(authHeader(token))
        .send({ phone: '+15551234567' });
      expect(res2.status).toBe(404);
    });

    it('14. results endpoint returns only owner suggestions and no raw hashes/identifiers', async () => {
      const app = buildApp();
      const userA = await createUser({ emailVerified: true, createdAtMsOffset: 20 * 60 * 1000 });
      const userB = await createUser({ emailVerified: true, createdAtMsOffset: 20 * 60 * 1000 });
      const tokenA = generateToken(userA.id);

      const sessionA = await request(app)
        .post('/api/contacts-sync/sessions')
        .set(authHeader(tokenA))
        .send({ platform: 'android' });
      expect(sessionA.status).toBe(201);

      const canonEmailB = canonicalizeEmail(userB.email);
      const hash = hmacIdentifier('email', canonEmailB);
      const hv = getContactSyncHashVersion();
      await prisma.userIdentifier.create({
        data: { userId: userB.id, kind: 'email', hash, hashVersion: hv, source: 'email', verifiedAt: new Date() },
      });

      await request(app)
        .post(`/api/contacts-sync/sessions/${sessionA.body.sessionId}/identifiers`)
        .set(authHeader(tokenA))
        .set('x-contacts-sync-token', sessionA.body.uploadToken)
        .send({ identifiers: [{ kind: 'email', value: canonEmailB }] });

      const res = await request(app)
        .get(`/api/contacts-sync/sessions/${sessionA.body.sessionId}/results`)
        .set(authHeader(tokenA));
      expect(res.status).toBe(200);
      expect(res.body?.ok).toBe(true);

      const text = JSON.stringify(res.body || {});
      // Must not include hash fields or uploaded identifier values
      expect(text.includes(hash)).toBe(false);
      expect(text.includes(canonEmailB)).toBe(false);
      expect(text.includes('+1555')).toBe(false);
    });
  });

  describe('E. Data lifecycle', () => {
    it('15. upload identifiers → results become available for owner', async () => {
      const app = buildApp();
      const userA = await createUser({ emailVerified: true, createdAtMsOffset: 20 * 60 * 1000 });
      const userB = await createUser({ emailVerified: true, createdAtMsOffset: 20 * 60 * 1000 });
      const tokenA = generateToken(userA.id);

      const sessionA = await request(app)
        .post('/api/contacts-sync/sessions')
        .set(authHeader(tokenA))
        .send({ platform: 'android' });
      expect(sessionA.status).toBe(201);

      const canonEmailB = canonicalizeEmail(userB.email);
      const hash = hmacIdentifier('email', canonEmailB);
      const hv = getContactSyncHashVersion();
      await prisma.userIdentifier.create({
        data: { userId: userB.id, kind: 'email', hash, hashVersion: hv, source: 'email', verifiedAt: new Date() },
      });

      const upload = await request(app)
        .post(`/api/contacts-sync/sessions/${sessionA.body.sessionId}/identifiers`)
        .set(authHeader(tokenA))
        .set('x-contacts-sync-token', sessionA.body.uploadToken)
        .send({ identifiers: [{ kind: 'email', value: canonEmailB }] });
      expect(upload.status).toBe(200);
      expect(upload.body?.ok).toBe(true);

      const results = await request(app)
        .get(`/api/contacts-sync/sessions/${sessionA.body.sessionId}/results`)
        .set(authHeader(tokenA));
      expect(results.status).toBe(200);
      expect(Array.isArray(results.body?.connect)).toBe(true);
      expect(results.body.connect.length).toBeGreaterThanOrEqual(1);
    });

    it('16. revoke marks consent/source state correctly', async () => {
      const app = buildApp();
      const userA = await createUser({ emailVerified: true, createdAtMsOffset: 20 * 60 * 1000 });
      const tokenA = generateToken(userA.id);

      const sessionA = await request(app)
        .post('/api/contacts-sync/sessions')
        .set(authHeader(tokenA))
        .send({ platform: 'android' });
      expect(sessionA.status).toBe(201);

      const revoke = await request(app)
        .post('/api/contacts-sync/revoke')
        .set(authHeader(tokenA))
        .send({});
      expect(revoke.status).toBe(200);
      expect(revoke.body?.ok).toBe(true);

      const src = await prisma.contactSyncSource.findUnique({ where: { id: sessionA.body.sessionId }, select: { status: true } });
      expect(src.status).toBe('disabled');
      const consent = await prisma.contactSyncConsent.findFirst({ where: { userId: userA.id }, orderBy: { createdAt: 'desc' }, select: { status: true } });
      expect(consent?.status).toBe('revoked');
    });

    it('17. delete removes sync data and can be safely repeated', async () => {
      const app = buildApp();
      const userA = await createUser({ emailVerified: true, createdAtMsOffset: 20 * 60 * 1000 });
      const tokenA = generateToken(userA.id);

      const sessionA = await request(app)
        .post('/api/contacts-sync/sessions')
        .set(authHeader(tokenA))
        .send({ platform: 'android' });
      expect(sessionA.status).toBe(201);

      const del1 = await request(app)
        .delete('/api/contacts-sync/data')
        .set(authHeader(tokenA));
      expect(del1.status).toBe(200);
      expect(del1.body?.ok).toBe(true);

      const del2 = await request(app)
        .delete('/api/contacts-sync/data')
        .set(authHeader(tokenA));
      expect(del2.status).toBe(200);
      expect(del2.body?.ok).toBe(true);

      const src = await prisma.contactSyncSource.findUnique({ where: { id: sessionA.body.sessionId }, select: { id: true } });
      expect(src).toBeNull();
    });
  });
});

