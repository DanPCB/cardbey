/**
 * Tests for guest access to Content Studio (GET/PUT /api/contents/:id)
 * - Guest with matching guestSessionId cookie can GET and PUT their content
 * - Guest with wrong/different guestSessionId gets 403
 * - Authenticated user can GET/PUT their own content
 * - Auth user cannot access guest-owned content (403)
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/server.js';
import { resetDb } from '../src/test/helpers/resetDb.js';
import prisma from '../src/lib/prisma.js';

const testRequest = request(app);
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-this';

process.env.NODE_ENV = 'test';

describe('Contents guest access (GET/PUT /api/contents/:id)', () => {
  let authUser;
  let authToken;
  let guestSessionIdA;
  let guestSessionIdB;
  let contentByAuth;
  let contentByGuestA;

  beforeEach(async () => {
    await resetDb(prisma);

    // Create authenticated user
    authUser = await prisma.user.create({
      data: {
        email: `auth-${Date.now()}@test.com`,
        passwordHash: 'hash',
        displayName: 'Auth User',
        roles: '["owner"]',
        role: 'owner',
      },
    });
    authToken = jwt.sign({ userId: authUser.id }, JWT_SECRET);

    // Create guest user A (as bootstrap does)
    guestSessionIdA = 'guest-session-a-' + Date.now();
    const guestUserIdA = `guest_${guestSessionIdA}`;
    await prisma.user.upsert({
      where: { id: guestUserIdA },
      update: {},
      create: {
        id: guestUserIdA,
        email: `guest-${guestUserIdA}@cardbey.guest`,
        passwordHash: 'guest-placeholder-no-login',
        displayName: 'Guest',
      },
    });

    // Create guest user B (different session)
    guestSessionIdB = 'guest-session-b-' + Date.now();
    const guestUserIdB = `guest_${guestSessionIdB}`;
    await prisma.user.upsert({
      where: { id: guestUserIdB },
      update: {},
      create: {
        id: guestUserIdB,
        email: `guest-${guestUserIdB}@cardbey.guest`,
        passwordHash: 'guest-placeholder-no-login',
        displayName: 'Guest',
      },
    });

    // Content owned by auth user
    contentByAuth = await prisma.content.create({
      data: {
        name: 'Auth Design',
        userId: authUser.id,
        elements: [],
        settings: {},
        version: 1,
      },
    });

    // Content owned by guest A
    contentByGuestA = await prisma.content.create({
      data: {
        name: 'Guest Design',
        userId: guestUserIdA,
        elements: [],
        settings: {},
        version: 1,
      },
    });
  });

  afterAll(async () => {
    await resetDb(prisma);
  });

  it('GET with matching guestSessionId cookie succeeds (200)', async () => {
    const res = await testRequest
      .get(`/api/contents/${contentByGuestA.id}`)
      .set('Cookie', `guestSessionId=${guestSessionIdA}`)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.data?.id).toBe(contentByGuestA.id);
    expect(res.body.data?.userId).toBe(`guest_${guestSessionIdA}`);
    expect(res.body.data?.name).toBe('Guest Design');
  });

  it('GET with X-Guest-Session header succeeds when cookie absent', async () => {
    const res = await testRequest
      .get(`/api/contents/${contentByGuestA.id}`)
      .set('X-Guest-Session', guestSessionIdA)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.data?.id).toBe(contentByGuestA.id);
  });

  it('GET with different guestSessionId returns 403', async () => {
    const res = await testRequest
      .get(`/api/contents/${contentByGuestA.id}`)
      .set('Cookie', `guestSessionId=${guestSessionIdB}`)
      .expect(403);

    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('forbidden');
  });

  it('GET without guest cookie or auth returns 403', async () => {
    const res = await testRequest
      .get(`/api/contents/${contentByGuestA.id}`)
      .expect(403);

    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('forbidden');
  });

  it('Auth user can GET their own content (200)', async () => {
    const res = await testRequest
      .get(`/api/contents/${contentByAuth.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.data?.id).toBe(contentByAuth.id);
    expect(res.body.data?.userId).toBe(authUser.id);
  });

  it('Auth user cannot GET guest-owned content (403)', async () => {
    const res = await testRequest
      .get(`/api/contents/${contentByGuestA.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(403);

    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('forbidden');
  });

  it('PUT with matching guestSessionId succeeds (200)', async () => {
    const res = await testRequest
      .put(`/api/contents/${contentByGuestA.id}`)
      .set('Cookie', `guestSessionId=${guestSessionIdA}`)
      .set('Content-Type', 'application/json')
      .send({
        name: 'Updated Guest Design',
        elements: [],
        settings: {},
      })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.data?.name).toBe('Updated Guest Design');
  });

  it('PUT with different guestSessionId returns 403', async () => {
    await testRequest
      .put(`/api/contents/${contentByGuestA.id}`)
      .set('Cookie', `guestSessionId=${guestSessionIdB}`)
      .set('Content-Type', 'application/json')
      .send({
        name: 'Hacked',
        elements: [],
        settings: {},
      })
      .expect(403);
  });
});
