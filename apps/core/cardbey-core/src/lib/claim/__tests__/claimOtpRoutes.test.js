/**
 * HTTP acceptance for POST /api/claim/initiate|verify
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import claimOtpRoutes from '../../../routes/claimOtpRoutes.js';
import { getPrismaClient } from '../../prisma.js';
import { resetClaimOtpsForTests } from '../claimOtpService.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/claim', claimOtpRoutes);
  return app;
}

describe('POST /api/claim (Phase 2 routes)', () => {
  beforeEach(async () => {
    process.env.CLAIM_OTP_LIVE_OUTREACH = 'false';
    process.env.DEV_OTP_INBOX = 'dev@cardbey.com';
    process.env.NODE_ENV = 'test';
    await resetClaimOtpsForTests();
  });

  afterEach(async () => {
    await resetClaimOtpsForTests();
  });

  it('initiate creates DB row and redirects; verify returns { valid: true }', async () => {
    const app = buildApp();
    const init = await request(app)
      .post('/api/claim/initiate')
      .send({ seedId: 'http-seed-1', email: 'lune@lunecroissanterie.com' });

    expect(init.status).toBe(200);
    expect(init.body.ok).toBe(true);
    expect(init.body.redirected).toBe(true);
    expect(init.body.recipient).toBe('dev@cardbey.com');
    expect(init.body.otp).toBeTruthy();

    const count = await getPrismaClient().claimOtp.count({ where: { seedId: 'http-seed-1' } });
    expect(count).toBe(1);

    const verify = await request(app)
      .post('/api/claim/verify')
      .send({ seedId: 'http-seed-1', email: 'lune@lunecroissanterie.com', code: init.body.otp });

    expect(verify.status).toBe(200);
    expect(verify.body).toMatchObject({ valid: true, ok: true });
  });
});
