/**
 * Durable claim OTP service (Prisma ClaimOtp) with concurrent-hardening.
 * Error codes: TOO_MANY_ATTEMPTS | LOCKED | EXPIRED | NOT_FOUND | INVALID | SEND_FAILED
 */

import crypto from 'node:crypto';
import { getPrismaClient } from '../prisma.js';
import { getDbCapabilities } from '../persistence/dbCapabilityRegistry.js';
import { sendClaimOtpEmail } from '../../services/email/sendClaimOtpEmail.js';
import { generateOtp } from '../discovery/claimOtpStore.js';
import { withClaimLock, otpLockKey } from './claimLock.js';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const INITIATE_WINDOW_MS = 60 * 60 * 1000;
export const INITIATE_MAX = 3; // 4th attempt within window → TOO_MANY_ATTEMPTS
export const VERIFY_MAX_ATTEMPTS = 5;

function hashOtp(code) {
  return crypto.createHash('sha256').update(String(code).trim()).digest('hex');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function claimOtpDelegate() {
  const prisma = getPrismaClient();
  return prisma?.claimOtp ?? null;
}

function isPostgres() {
  return getDbCapabilities().isPostgres === true;
}

/**
 * Persist a new OTP under lock / FOR UPDATE. Email is sent after the transaction releases.
 * @param {{ seedId: string, email: string, userId?: string | null, businessName?: string | null }} params
 */
export async function initiateClaimOtp(params) {
  const seedId = String(params.seedId || '').trim();
  const email = normalizeEmail(params.email);
  if (!seedId || !email || !email.includes('@')) {
    return { ok: false, code: 'INVALID', message: 'seedId and valid email are required.' };
  }

  const db = claimOtpDelegate();
  if (!db) {
    return { ok: false, code: 'UNAVAILABLE', message: 'ClaimOtp table not available.' };
  }

  const created = await withClaimLock(otpLockKey(seedId, email), async () => {
    const prisma = getPrismaClient();
    const now = new Date();
    const windowStart = new Date(now.getTime() - INITIATE_WINDOW_MS);
    const otp = generateOtp();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
    const codeHash = hashOtp(otp);

    const runCritical = async (tx) => {
      const otpDb = tx.claimOtp;

      const active = await otpDb.findFirst({
        where: {
          seedId,
          email,
          usedAt: null,
          lockedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (active) {
        return {
          ok: false,
          code: 'TOO_MANY_ATTEMPTS',
          message: 'An OTP is already pending for this claim. Wait before requesting another.',
        };
      }

      const recentCount = await otpDb.count({
        where: {
          seedId,
          email,
          createdAt: { gte: windowStart },
        },
      });
      if (recentCount >= INITIATE_MAX) {
        return {
          ok: false,
          code: 'TOO_MANY_ATTEMPTS',
          message: 'Too many OTP requests. Try again later.',
        };
      }

      // Placeholder recipient until mailer runs (filled after send).
      const row = await otpDb.create({
        data: {
          seedId,
          email,
          recipientEmail: email,
          codeHash,
          userId: params.userId ?? null,
          expiresAt,
          lastSentAt: now,
        },
      });

      return { ok: true, row, otp };
    };

    if (isPostgres() && typeof prisma.$transaction === 'function') {
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM claim_otp
          WHERE "seedId" = ${seedId} AND email = ${email}
          ORDER BY "createdAt" DESC
          LIMIT 1
          FOR UPDATE
        `;
        return runCritical(tx);
      });
    }

    return runCritical(prisma);
  });

  if (!created.ok) {
    return {
      ok: false,
      code: created.code,
      message: created.message,
    };
  }

  const sendResult = await sendClaimOtpEmail({
    email,
    otp: created.otp,
    seedId,
    businessName: params.businessName ?? null,
  });

  if (!sendResult.ok) {
    try {
      await db.delete({ where: { id: created.row.id } });
    } catch {
      /* best-effort rollback */
    }
    return {
      ok: false,
      code: 'SEND_FAILED',
      message: sendResult.error || 'Failed to send OTP email.',
    };
  }

  if (sendResult.recipient && sendResult.recipient !== email) {
    try {
      await db.update({
        where: { id: created.row.id },
        data: { recipientEmail: sendResult.recipient },
      });
    } catch {
      /* non-fatal */
    }
  }

  const payload = {
    ok: true,
    code: 'CREATED',
    otpId: created.row.id,
    expiresAt: created.row.expiresAt.toISOString(),
    redirected: sendResult.redirected,
    recipient: sendResult.recipient,
    skipped: Boolean(sendResult.skipped),
  };
  if (process.env.NODE_ENV !== 'production') {
    payload.otp = created.otp;
  }
  return payload;
}

/**
 * @param {{ seedId: string, email: string, code: string, userId?: string | null }} params
 */
export async function verifyClaimOtpCode(params) {
  const seedId = String(params.seedId || '').trim();
  const email = normalizeEmail(params.email);
  const code = String(params.code || '').trim();

  if (!seedId || !email || !code) {
    return { ok: false, valid: false, code: 'INVALID', message: 'seedId, email, and code are required.' };
  }

  const db = claimOtpDelegate();
  if (!db) {
    return { ok: false, valid: false, code: 'UNAVAILABLE', message: 'ClaimOtp table not available.' };
  }

  return withClaimLock(otpLockKey(seedId, email), async () => {
    const prisma = getPrismaClient();

    const runVerify = async (tx) => {
      const otpDb = tx.claimOtp;
      let row = await otpDb.findFirst({
        where: { seedId, email },
        orderBy: { createdAt: 'desc' },
      });
      if (!row) {
        return { ok: false, valid: false, code: 'NOT_FOUND', message: 'OTP not found.' };
      }

      if (isPostgres()) {
        const locked = await tx.$queryRaw`
          SELECT id, "usedAt", "lockedAt", "expiresAt", "codeHash", "attemptCount"
          FROM claim_otp WHERE id = ${row.id} FOR UPDATE
        `;
        if (Array.isArray(locked) && locked[0]) {
          const L = locked[0];
          row = {
            ...row,
            usedAt: L.usedAt,
            lockedAt: L.lockedAt,
            expiresAt: L.expiresAt instanceof Date ? L.expiresAt : new Date(L.expiresAt),
            codeHash: L.codeHash,
            attemptCount: L.attemptCount,
          };
        }
      }

      if (row.usedAt) {
        return { ok: false, valid: false, code: 'NOT_FOUND', message: 'OTP already used.' };
      }
      if (row.lockedAt) {
        return { ok: false, valid: false, code: 'LOCKED', message: 'OTP locked after too many failures.' };
      }
      if (new Date(row.expiresAt).getTime() <= Date.now()) {
        return { ok: false, valid: false, code: 'EXPIRED', message: 'OTP expired.' };
      }

      if (row.codeHash !== hashOtp(code)) {
        const nextAttempts = (row.attemptCount ?? 0) + 1;
        const lock = nextAttempts >= VERIFY_MAX_ATTEMPTS;
        await otpDb.update({
          where: { id: row.id },
          data: {
            attemptCount: nextAttempts,
            ...(lock ? { lockedAt: new Date() } : {}),
          },
        });
        if (lock) {
          return { ok: false, valid: false, code: 'LOCKED', message: 'OTP locked after too many failures.' };
        }
        return { ok: false, valid: false, code: 'INVALID', message: 'Incorrect OTP.' };
      }

      await otpDb.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });

      return { ok: true, valid: true, code: 'OK', otpId: row.id };
    };

    if (isPostgres() && typeof prisma.$transaction === 'function') {
      return prisma.$transaction(async (tx) => runVerify(tx));
    }
    return runVerify(prisma);
  });
}

/** Test helper — wipe claim OTPs (local/test only). */
export async function resetClaimOtpsForTests() {
  const db = claimOtpDelegate();
  if (!db) return;
  await db.deleteMany({});
}
