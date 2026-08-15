/**
 * Phase 2 Claim OTP acceptance — durable ClaimOtp + redirect flag + error codes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPrismaClient } from '../../prisma.js';
import {
  initiateClaimOtp,
  verifyClaimOtpCode,
  resetClaimOtpsForTests,
  INITIATE_MAX,
  VERIFY_MAX_ATTEMPTS,
} from '../claimOtpService.js';

vi.mock('../../services/email/sendClaimOtpEmail.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    sendClaimOtpEmail: vi.fn(async ({ email }) => {
      const live =
        process.env.CLAIM_OTP_LIVE_OUTREACH === 'true' || process.env.CLAIM_OTP_LIVE_OUTREACH === '1';
      const recipient = live
        ? String(email).toLowerCase()
        : String(process.env.DEV_OTP_INBOX || 'dev@cardbey.com').toLowerCase();
      const redirected = recipient !== String(email).toLowerCase();
      if (redirected) {
        console.warn(`[ClaimOtp] Redirecting OTP from ${email} → ${recipient} (live outreach disabled)`);
      }
      return { ok: true, recipient, redirected, skipped: true };
    }),
  };
});

describe('claimOtpService (Phase 2)', () => {
  beforeEach(async () => {
    process.env.CLAIM_OTP_LIVE_OUTREACH = 'false';
    process.env.DEV_OTP_INBOX = 'dev@cardbey.com';
    process.env.NODE_ENV = 'test';
    const prisma = getPrismaClient();
    if (!prisma.claimOtp) {
      throw new Error('ClaimOtp delegate missing — run prisma generate + migrate');
    }
    await resetClaimOtpsForTests();
  });

  afterEach(async () => {
    await resetClaimOtpsForTests();
  });

  it('ClaimOtp table exists with 0 rows after reset', async () => {
    const prisma = getPrismaClient();
    const count = await prisma.claimOtp.count();
    expect(count).toBe(0);
  });

  it('initiate creates OTP row and redirects to DEV_OTP_INBOX', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await initiateClaimOtp({
      seedId: 'seed-otp-1',
      email: 'hello@pellegrinis.com.au',
      businessName: "Pellegrini's Espresso Bar",
    });
    expect(result.ok).toBe(true);
    expect(result.redirected).toBe(true);
    expect(result.recipient).toBe('dev@cardbey.com');
    expect(result.otp).toBeTruthy();

    const prisma = getPrismaClient();
    const rows = await prisma.claimOtp.findMany({ where: { seedId: 'seed-otp-1' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('hello@pellegrinis.com.au');
    expect(rows[0].recipientEmail).toBe('dev@cardbey.com');
    expect(rows[0].usedAt).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Redirecting OTP from hello@pellegrinis.com.au → dev@cardbey.com'),
    );
    warn.mockRestore();
  });

  it('verify with correct code sets usedAt and returns valid:true', async () => {
    const issued = await initiateClaimOtp({
      seedId: 'seed-otp-2',
      email: 'owner@example.com',
    });
    const verified = await verifyClaimOtpCode({
      seedId: 'seed-otp-2',
      email: 'owner@example.com',
      code: issued.otp,
    });
    expect(verified).toMatchObject({ ok: true, valid: true });

    const row = await getPrismaClient().claimOtp.findFirst({
      where: { seedId: 'seed-otp-2' },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.usedAt).toBeTruthy();
  });

  it('verify wrong code ×5 returns LOCKED on attempt 5', async () => {
    await initiateClaimOtp({ seedId: 'seed-otp-3', email: 'lock@example.com' });
    let last;
    for (let i = 0; i < VERIFY_MAX_ATTEMPTS; i++) {
      last = await verifyClaimOtpCode({
        seedId: 'seed-otp-3',
        email: 'lock@example.com',
        code: '000000',
      });
    }
    expect(last?.code).toBe('LOCKED');
    const row = await getPrismaClient().claimOtp.findFirst({
      where: { seedId: 'seed-otp-3' },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.lockedAt).toBeTruthy();
    expect(row?.attemptCount).toBe(VERIFY_MAX_ATTEMPTS);
  });

  it('initiate ×4 within window returns TOO_MANY_ATTEMPTS on attempt 4', async () => {
    const email = 'rate@example.com';
    const seedId = 'seed-otp-4';
    const prisma = getPrismaClient();
    for (let i = 0; i < INITIATE_MAX; i++) {
      const r = await initiateClaimOtp({ seedId, email });
      expect(r.ok).toBe(true);
      // Supersede active OTP so sequential resend within rate window is allowed
      await prisma.claimOtp.update({
        where: { id: r.otpId },
        data: { usedAt: new Date() },
      });
    }
    const blocked = await initiateClaimOtp({ seedId, email });
    expect(blocked.ok).toBe(false);
    expect(blocked.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('concurrent initiate ×2 same seed+email → one OTP row, second TOO_MANY_ATTEMPTS', async () => {
    const seedId = 'seed-otp-race-init';
    const email = 'race-init@example.com';
    const [a, b] = await Promise.all([
      initiateClaimOtp({ seedId, email }),
      initiateClaimOtp({ seedId, email }),
    ]);
    const results = [a, b];
    const ok = results.filter((r) => r.ok);
    const blocked = results.filter((r) => !r.ok);
    expect(ok).toHaveLength(1);
    expect(blocked).toHaveLength(1);
    expect(blocked[0].code).toBe('TOO_MANY_ATTEMPTS');
    const count = await getPrismaClient().claimOtp.count({ where: { seedId, email } });
    expect(count).toBe(1);
  });

  it('concurrent verify ×2 same OTP → one success, second NOT_FOUND', async () => {
    const seedId = 'seed-otp-race-verify';
    const email = 'race-verify@example.com';
    const issued = await initiateClaimOtp({ seedId, email });
    expect(issued.ok).toBe(true);
    const [a, b] = await Promise.all([
      verifyClaimOtpCode({ seedId, email, code: issued.otp }),
      verifyClaimOtpCode({ seedId, email, code: issued.otp }),
    ]);
    const results = [a, b];
    const ok = results.filter((r) => r.ok && r.valid);
    const fail = results.filter((r) => !r.valid);
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);
    expect(fail[0].code).toBe('NOT_FOUND');
  });

  it('verify expired OTP returns EXPIRED', async () => {
    const issued = await initiateClaimOtp({
      seedId: 'seed-otp-5',
      email: 'expire@example.com',
    });
    await getPrismaClient().claimOtp.update({
      where: { id: issued.otpId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const verified = await verifyClaimOtpCode({
      seedId: 'seed-otp-5',
      email: 'expire@example.com',
      code: issued.otp,
    });
    expect(verified.code).toBe('EXPIRED');
    expect(verified.valid).toBe(false);
  });

  it('re-verify a used OTP returns NOT_FOUND', async () => {
    const issued = await initiateClaimOtp({
      seedId: 'seed-otp-6',
      email: 'used@example.com',
    });
    await verifyClaimOtpCode({
      seedId: 'seed-otp-6',
      email: 'used@example.com',
      code: issued.otp,
    });
    const again = await verifyClaimOtpCode({
      seedId: 'seed-otp-6',
      email: 'used@example.com',
      code: issued.otp,
    });
    expect(again.code).toBe('NOT_FOUND');
  });
});
