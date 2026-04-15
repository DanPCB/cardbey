/**
 * Password reset: create hashed token, send email, validate and reset.
 * Uses PasswordResetToken model (hashed token, one-time use).
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { sendMail } from '../email/mailer.js';
import { generateToken } from '../../middleware/auth.js';

const prisma = new PrismaClient();

const RESET_EXPIRY_MINUTES = parseInt(process.env.PASSWORD_RESET_EXPIRY_MINUTES || '60', 10);
const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || '';

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Create a reset token for the user, store hash, send email if mailer configured.
 * @param {{ email: string }} params
 * @returns {{ ok: true }} Always (do not reveal if user exists).
 */
export async function requestPasswordReset({ email }) {
  const normalized = (email || '').toString().trim().toLowerCase();
  if (!normalized) {
    return { ok: true };
  }

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) {
    return { ok: true };
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_EXPIRY_MINUTES * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  const ENABLED = process.env.ENABLE_EMAIL_VERIFICATION === 'true' || process.env.ENABLE_EMAIL_VERIFICATION === '1';
  const MAIL_HOST = process.env.MAIL_HOST || '';
  if (ENABLED && MAIL_HOST.trim()) {
    const resetUrl = APP_PUBLIC_URL
      ? `${APP_PUBLIC_URL.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(user.email)}`
      : null;
    const html = resetUrl
      ? `<!DOCTYPE html><html><body><p>You requested a password reset. Click the link below (valid for ${RESET_EXPIRY_MINUTES} minutes):</p><p><a href="${resetUrl}">Reset password</a></p><p>If you didn't request this, ignore this email.</p></body></html>`
      : `<!DOCTYPE html><html><body><p>You requested a password reset. Use this token (valid for ${RESET_EXPIRY_MINUTES} minutes):</p><p><code>${rawToken}</code></p><p>If you didn't request this, ignore this email.</p></body></html>`;
    await sendMail({
      to: user.email,
      subject: 'Cardbey – Reset your password',
      html,
    });
  } else {
    console.log('[PasswordReset] Skipped sending email (ENABLE_EMAIL_VERIFICATION or MAIL_HOST not set)', { email: user.email });
  }

  return { ok: true };
}

/**
 * Reset password with token. Validates token, updates password, marks token used.
 * @param {{ email: string, token: string, newPassword: string }} params
 * @returns {{ ok: true, token?: string }} Optional JWT to auto-login.
 */
export async function resetPassword({ email, token, newPassword }) {
  const normalizedEmail = (email || '').toString().trim().toLowerCase();
  const rawToken = (token || '').toString().trim();
  const password = (newPassword || '').toString();

  if (!normalizedEmail || !rawToken || password.length < 6) {
    const err = new Error('Invalid or missing email, token, or password (min 6 characters)');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findFirst({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    const err = new Error('Invalid or expired reset token');
    err.code = 'INVALID_OR_EXPIRED_TOKEN';
    throw err;
  }
  if (record.user.email !== normalizedEmail) {
    const err = new Error('Token does not match email');
    err.code = 'TOKEN_EMAIL_MISMATCH';
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  const jwt = generateToken(record.userId);
  return { ok: true, token: jwt };
}
