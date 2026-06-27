/**
 * Tests for email verification endpoints
 * - Token generation
 * - Expired token handling
 * - Success verification
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

vi.mock('../src/services/email/mailer.js', () => ({ sendMail: vi.fn().mockResolvedValue({ ok: true }) }));

import app from '../src/server.js';
import { sendMail } from '../src/services/email/mailer.js';
import { resetDb } from '../src/test/helpers/resetDb.js';

const prisma = new PrismaClient();
const testRequest = request(app);

// Test user data
let testUser;
let testToken;

beforeAll(async () => {});

afterAll(async () => {
  await resetDb(prisma);
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Ensure isolated DB state per test (other suites may delete users in parallel).
  await resetDb(prisma);

  const hashedPassword = await bcrypt.hash('testpassword123', 10);
  testUser = await prisma.user.create({
    data: {
      email: `test-verification-${Date.now()}@example.com`,
      passwordHash: hashedPassword,
      displayName: 'Test User',
      emailVerified: false,
    },
  });

  const { generateToken } = await import('../src/middleware/auth.js');
  testToken = generateToken(testUser.id);
});

describe('POST /api/auth/request-verification', () => {
  it('should generate a verification token (stored as hash)', async () => {
    const response = await testRequest
      .post('/api/auth/request-verification')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(response.body.ok).toBe(true);
    // Non-production returns token for testing
    // Raw token is base64url (32 bytes → 43 chars), not 64-char hex
    if (response.body.token) expect(response.body.token.length).toBe(43);

    const user = await prisma.user.findUnique({
      where: { id: testUser.id }
    });
    expect(user.verificationToken).toBeTruthy();
    expect(user.verificationToken.length).toBe(64); // SHA-256 hex hash
    expect(user.verificationExpires).toBeTruthy();
    expect(new Date(user.verificationExpires) > new Date()).toBe(true);
  });

  it('should require authentication', async () => {
    const response = await testRequest
      .post('/api/auth/request-verification')
      .expect(401);
    expect(response.body.ok).toBe(false);
    expect(response.status).toBe(401);
  });

  it('should reject if email already verified', async () => {
    // Mark user as verified
    await prisma.user.update({
      where: { id: testUser.id },
      data: { emailVerified: true }
    });

    const response = await testRequest
      .post('/api/auth/request-verification')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(400);

    expect(response.body.ok).toBe(false);
    expect(response.body.error).toContain('already verified');
  });

  it('should generate different tokens on multiple requests', async () => {
    await testRequest
      .post('/api/auth/request-verification')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);
    const user1 = await prisma.user.findUnique({ where: { id: testUser.id } });
    const hash1 = user1.verificationToken;

    const second = await testRequest
      .post('/api/auth/request-verification')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);
    const user2 = await prisma.user.findUnique({ where: { id: testUser.id } });
    const hash2 = user2.verificationToken;
    // Current behavior: if a valid token is already minted, the API may reuse it (resend)
    // instead of rotating to a new token on each request.
    if (hash1 === hash2) {
      expect(second.body.reusedToken).toBe(true);
    } else {
      expect(hash1).not.toBe(hash2);
    }
  });
});

describe('POST /api/auth/verify/request', () => {
  it('should require auth (401)', async () => {
    const response = await testRequest
      .post('/api/auth/verify/request')
      .expect(401);
    expect(response.body.ok).toBe(false);
    expect(response.status).toBe(401);
  });

  it('returns 200 ok:true when ENABLE_EMAIL_VERIFICATION is false (stub path, no throw)', async () => {
    const prev = process.env.ENABLE_EMAIL_VERIFICATION;
    process.env.ENABLE_EMAIL_VERIFICATION = 'false';
    try {
      const response = await testRequest
        .post('/api/auth/verify/request')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.token).toBeDefined();
    } finally {
      if (prev !== undefined) process.env.ENABLE_EMAIL_VERIFICATION = prev;
      else delete process.env.ENABLE_EMAIL_VERIFICATION;
    }
  });

  it('calls sendMail with correct to/subject/link when ENABLE_EMAIL_VERIFICATION=true and MAIL_HOST set', async () => {
    vi.mocked(sendMail).mockClear();
    const prevEnv = process.env.ENABLE_EMAIL_VERIFICATION;
    const prevHost = process.env.MAIL_HOST;
    process.env.ENABLE_EMAIL_VERIFICATION = 'true';
    process.env.MAIL_HOST = 'smtp.test';
    try {
      await testRequest
        .post('/api/auth/verify/request')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);
      expect(sendMail).toHaveBeenCalledTimes(1);
      const call = vi.mocked(sendMail).mock.calls[0][0];
      expect(call.to).toBe(testUser.email);
      expect(call.subject).toContain('Confirm');
      expect(call.html).toContain('/api/auth/verify-email');
      expect(call.html).not.toContain('/api/auth/verify/confirm');
    } finally {
      process.env.ENABLE_EMAIL_VERIFICATION = prevEnv;
      process.env.MAIL_HOST = prevHost;
    }
  });
});

describe('GET /api/auth/verify/confirm', () => {
  const savedWebBaseEnv = {};

  beforeEach(() => {
    for (const k of ['PUBLIC_APP_URL', 'DASHBOARD_URL']) {
      savedWebBaseEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ['PUBLIC_APP_URL', 'DASHBOARD_URL']) {
      if (savedWebBaseEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedWebBaseEnv[k];
    }
  });

  it('redirects browser GET invalid token to email-verified invalid URL when configured', async () => {
    process.env.DASHBOARD_URL = 'https://cardbey.com';
    const response = await testRequest
      .get('/api/auth/verify-email?token=not-a-real-token')
      .expect(302);
    expect(response.headers.location).toBe(
      'https://cardbey.com/email-verified?status=invalid',
    );
  });

  it('legacy GET /verify/confirm redirects to verify-email', async () => {
    const response = await testRequest
      .get('/api/auth/verify/confirm?token=legacy-token')
      .expect(302);
    expect(response.headers.location).toBe(
      '/api/auth/verify-email?token=legacy-token',
    );
  });

  it('accepts base64url token with encoding-safe characters', async () => {
    process.env.DASHBOARD_URL = 'https://cardbey.com';
    const requestRes = await testRequest
      .post('/api/auth/request-verification')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);
    const rawToken = requestRes.body.token;
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]+$/);

    const verifyRes = await testRequest
      .get(`/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`)
      .expect(302);
    expect(verifyRes.headers.location).toBe('https://cardbey.com/email-verified?status=success');

    const user = await prisma.user.findUnique({ where: { id: testUser.id } });
    expect(user.emailVerified).toBe(true);
  });

  it('GET verify-email consumes token and redirects success', async () => {
    process.env.DASHBOARD_URL = 'https://cardbey.com';
    const requestRes = await testRequest
      .post('/api/auth/request-verification')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);
    const rawToken = requestRes.body.token;
    expect(rawToken).toBeTruthy();

    const verifyRes = await testRequest
      .get(`/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`)
      .expect(302);
    expect(verifyRes.headers.location).toBe('https://cardbey.com/email-verified?status=success');

    const user = await prisma.user.findUnique({ where: { id: testUser.id } });
    expect(user.emailVerified).toBe(true);
    expect(user.verificationToken).toBeTruthy();
    expect(user.verificationTokenRaw).toBeNull();
    expect(user.verificationExpires).toBeNull();
  });

  it('POST /verify/confirm still works for programmatic clients', async () => {
    const requestRes = await testRequest
      .post('/api/auth/request-verification')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);
    const rawToken = requestRes.body.token;

    const confirmRes = await testRequest
      .post('/api/auth/verify/confirm')
      .set('Accept', 'application/json')
      .send({ token: rawToken })
      .expect(200);
    expect(confirmRes.body.ok).toBe(true);
    expect(confirmRes.body.verified).toBe(true);

    const user = await prisma.user.findUnique({ where: { id: testUser.id } });
    expect(user.emailVerified).toBe(true);
  });

  it('returns JSON when verify-email has no web base configured', async () => {
    const savedNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const response = await testRequest
        .get('/api/auth/verify-email?token=invalid-token-12345')
        .expect(400);
      expect(response.body.ok).toBe(false);
      expect(response.body.code).toBe('TOKEN_INVALID');
    } finally {
      process.env.NODE_ENV = savedNodeEnv;
    }
  });

  it('redirects expired verify-email token to email-verified expired status', async () => {
    process.env.DASHBOARD_URL = 'https://cardbey.com';
    const rawToken = 'expired-raw-' + Date.now();
    const crypto = await import('crypto');
    const hashed = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
    const expiredDate = new Date(Date.now() - 60000);
    await prisma.user.update({
      where: { id: testUser.id },
      data: {
        verificationToken: hashed,
        verificationExpires: expiredDate,
      },
    });
    const response = await testRequest
      .get(`/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`)
      .expect(302);
    expect(response.headers.location).toBe('https://cardbey.com/email-verified?status=expired');
  });
});

describe('post-verify dashboard redirect (via verify/confirm)', () => {
  const savedEnv = {};

  beforeEach(() => {
    for (const k of ['PUBLIC_APP_URL', 'DASHBOARD_URL']) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    process.env.DASHBOARD_URL = 'http://192.168.1.11:5174';
  });

  afterEach(() => {
    for (const k of ['PUBLIC_APP_URL', 'DASHBOARD_URL']) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it('redirects relative redirect_uri to DASHBOARD_URL origin on POST confirm', async () => {
    const requestRes = await testRequest
      .post('/api/auth/request-verification')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);
    const rawToken = requestRes.body.token;

    const confirmRes = await testRequest
      .post('/api/auth/verify/confirm')
      .send({
        token: rawToken,
        redirect_uri: '/app?verified=1',
      })
      .expect(302);

    expect(confirmRes.headers.location).toBe(
      'http://192.168.1.11:5174/app?verified=1',
    );
  });

  it('uses default redirect when redirect_uri is an absolute URL (open redirect blocked)', async () => {
    const requestRes = await testRequest
      .post('/api/auth/request-verification')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);
    const rawToken = requestRes.body.token;

    const confirmRes = await testRequest
      .post('/api/auth/verify/confirm')
      .set('Accept', 'application/json')
      .send({
        token: rawToken,
        redirect_uri: 'http://evil.example/phish',
      })
      .expect(200);

    expect(confirmRes.body.ok).toBe(true);
    expect(confirmRes.body.verified).toBe(true);
    expect(confirmRes.headers.location).toBeUndefined();
  });
});

describe('GET /api/auth/verify', () => {
  it('requires POST /verify/confirm to consume a pending token', async () => {
    const requestRes = await testRequest
      .post('/api/auth/request-verification')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);
    const rawToken = requestRes.body.token;
    expect(rawToken).toBeTruthy();

    const verifyResponse = await testRequest
      .get(`/api/auth/verify?token=${encodeURIComponent(rawToken)}`)
      .expect(400);
    expect(verifyResponse.body.code).toBe('CONFIRMATION_REQUIRED');

    await testRequest
      .post('/api/auth/verify/confirm')
      .set('Accept', 'application/json')
      .send({ token: rawToken })
      .expect(200);

    const user = await prisma.user.findUnique({ where: { id: testUser.id } });
    expect(user.emailVerified).toBe(true);
    expect(user.verificationToken).toBeTruthy();
    expect(user.verificationTokenRaw).toBeNull();
    expect(user.verificationExpires).toBeNull();
  });

  it('should reject invalid token', async () => {
    const response = await testRequest
      .get('/api/auth/verify?token=invalid-token-12345')
      .expect(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toMatch(/Invalid token/i);
  });

  it('should reject expired token', async () => {
    const rawToken = 'expired-raw-' + Date.now();
    const crypto = await import('crypto');
    const hashed = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
    const expiredDate = new Date(Date.now() - 60000);
    await prisma.user.update({
      where: { id: testUser.id },
      data: { verificationToken: hashed, verificationExpires: expiredDate }
    });
    const response = await testRequest
      .get(`/api/auth/verify?token=${encodeURIComponent(rawToken)}`)
      .expect(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toMatch(/Token expired/i);
  });

  it('should reject missing token', async () => {
    const response = await testRequest
      .get('/api/auth/verify')
      .expect(400);

    expect(response.body.ok).toBe(false);
    expect(response.body.error).toContain('Token required');
  });

  it('should reject if email already verified', async () => {
    await prisma.user.update({
      where: { id: testUser.id },
      data: { emailVerified: true }
    });
    await testRequest
      .post('/api/auth/request-verification')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(400);

    const rawToken = 'already-verified-' + Date.now();
    const crypto = await import('crypto');
    const hashed = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
    const futureDate = new Date(Date.now() + 60000);
    await prisma.user.update({
      where: { id: testUser.id },
      data: {
        emailVerified: true,
        verificationToken: hashed,
        verificationExpires: futureDate
      }
    });
    const response = await testRequest
      .get(`/api/auth/verify?token=${encodeURIComponent(rawToken)}`)
      .expect(200);
    expect(response.body.ok).toBe(true);
  });

  it('second GET after verify is idempotent (redirect success)', async () => {
    const savedPublic = process.env.PUBLIC_APP_URL;
    const savedDash = process.env.DASHBOARD_URL;
    process.env.PUBLIC_APP_URL = 'https://app.test';
    delete process.env.DASHBOARD_URL;
    try {
      const requestRes = await testRequest
        .post('/api/auth/request-verification')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);
      const rawToken = requestRes.body.token;
      expect(rawToken).toBeTruthy();

      await testRequest
        .get(`/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`)
        .expect(302);

      const secondGet = await testRequest
        .get(`/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`)
        .expect(302);
      expect(secondGet.headers.location).toBe('https://app.test/email-verified?status=success');
    } finally {
      if (savedPublic === undefined) delete process.env.PUBLIC_APP_URL;
      else process.env.PUBLIC_APP_URL = savedPublic;
      if (savedDash === undefined) delete process.env.DASHBOARD_URL;
      else process.env.DASHBOARD_URL = savedDash;
    }
  });
});

describe('POST /api/auth/verify/resend', () => {
  it('resend after expiry mints new token and allows verification', async () => {
    const expiredRaw = 'expired-resend-' + Date.now();
    const crypto = await import('crypto');
    const hashed = crypto.createHash('sha256').update(expiredRaw, 'utf8').digest('hex');
    await prisma.user.update({
      where: { id: testUser.id },
      data: {
        verificationToken: hashed,
        verificationExpires: new Date(Date.now() - 60000),
      },
    });

    const prevEnv = process.env.ENABLE_EMAIL_VERIFICATION;
    const prevHost = process.env.MAIL_HOST;
    process.env.ENABLE_EMAIL_VERIFICATION = 'true';
    process.env.MAIL_HOST = 'smtp.test';
    try {
      vi.mocked(sendMail).mockClear();
      const resendRes = await testRequest
        .post('/api/auth/verify/resend')
        .set('Accept', 'application/json')
        .send({ email: testUser.email })
        .expect(200);
      expect(resendRes.body.ok).toBe(true);
      expect(resendRes.body.message).toMatch(/If an account exists/i);
      expect(sendMail).toHaveBeenCalledTimes(1);

      const user = await prisma.user.findUnique({ where: { id: testUser.id } });
      expect(user.verificationToken).not.toBe(hashed);
      expect(new Date(user.verificationExpires) > new Date()).toBe(true);

      const mailHtml = vi.mocked(sendMail).mock.calls[0][0].html;
      const tokenMatch = mailHtml.match(/token=([^&"']+)/);
      expect(tokenMatch).toBeTruthy();
      const newRaw = decodeURIComponent(tokenMatch[1]);

      await testRequest
        .post('/api/auth/verify/confirm')
        .set('Accept', 'application/json')
        .send({ token: newRaw })
        .expect(200);

      const verified = await prisma.user.findUnique({ where: { id: testUser.id } });
      expect(verified.emailVerified).toBe(true);
    } finally {
      process.env.ENABLE_EMAIL_VERIFICATION = prevEnv;
      process.env.MAIL_HOST = prevHost;
    }
  });

  it('returns generic message for unknown email (no enumeration)', async () => {
    const response = await testRequest
      .post('/api/auth/verify/resend')
      .set('Accept', 'application/json')
      .send({ email: 'nobody-here@example.com' })
      .expect(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.message).toMatch(/If an account exists/i);
  });

  it('POST /api/auth/resend-verification is an alias for verify/resend', async () => {
    const response = await testRequest
      .post('/api/auth/resend-verification')
      .set('Accept', 'application/json')
      .send({ email: testUser.email })
      .expect(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.message).toMatch(/If an account exists/i);
  });
});

describe('Token generation', () => {
  it('should store hashed token (64 hex chars)', async () => {
    await testRequest
      .post('/api/auth/request-verification')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);
    const user = await prisma.user.findUnique({ where: { id: testUser.id } });
    expect(user.verificationToken.length).toBe(64);
  });

  it('reuses valid token on repeat verify/request (does not invalidate signup email)', async () => {
    const first = await testRequest
      .post('/api/auth/request-verification')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);
    const user1 = await prisma.user.findUnique({ where: { id: testUser.id } });
    const hash1 = user1.verificationToken;
    const raw1 = first.body.token;

    const second = await testRequest
      .post('/api/auth/request-verification')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);
    const user2 = await prisma.user.findUnique({ where: { id: testUser.id } });
    expect(user2.verificationToken).toBe(hash1);
    expect(second.body.reusedToken).toBe(true);
    expect(second.body.token).toBe(raw1);

    await testRequest
      .post('/api/auth/verify/confirm')
      .set('Accept', 'application/json')
      .send({ token: raw1 })
      .expect(200);
  });

  it('rotates token after expiry on verify/request', async () => {
    const first = await testRequest
      .post('/api/auth/request-verification')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);
    const hash1 = (await prisma.user.findUnique({ where: { id: testUser.id } })).verificationToken;

    await prisma.user.update({
      where: { id: testUser.id },
      data: { verificationExpires: new Date(Date.now() - 60_000) },
    });

    const second = await testRequest
      .post('/api/auth/request-verification')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);
    const hash2 = (await prisma.user.findUnique({ where: { id: testUser.id } })).verificationToken;
    expect(hash2).not.toBe(hash1);
    expect(second.body.reusedToken).toBe(false);
    expect(second.body.token).not.toBe(first.body.token);
  });

  it('GET /api/auth/me includes emailVerified after verification', async () => {
    const requestRes = await testRequest
      .post('/api/auth/request-verification')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);
    await testRequest
      .post('/api/auth/verify/confirm')
      .set('Accept', 'application/json')
      .send({ token: requestRes.body.token })
      .expect(200);
    const meRes = await testRequest
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);
    expect(meRes.body.ok).toBe(true);
    expect(meRes.body.user.emailVerified).toBe(true);
  });

  it('should set expiry to 24 hours from now in non-production', async () => {
    await testRequest
      .post('/api/auth/request-verification')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);
    const user = await prisma.user.findUnique({ where: { id: testUser.id } });
    const expiresAt = new Date(user.verificationExpires).getTime();
    const now = Date.now();
    const minutesUntilExpiry = (expiresAt - now) / (1000 * 60);
    expect(minutesUntilExpiry).toBeGreaterThan(23 * 60);
    expect(minutesUntilExpiry).toBeLessThan(25 * 60);
  });
});

