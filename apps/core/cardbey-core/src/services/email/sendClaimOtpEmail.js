/**
 * sendClaimOtpEmail.js
 * Location: apps/core/cardbey-core/src/services/email/sendClaimOtpEmail.js
 *
 * Uses Cardbey's existing mailer.js (Nodemailer/SMTP via mail.cardbey.com).
 * No external provider dependency — same transport used by auth, EOI, and
 * password reset flows.
 *
 * Required env vars (already set in .env and Render):
 *   MAIL_HOST, MAIL_PORT, MAIL_SECURE, MAIL_USER, MAIL_PASS
 *   MAIL_FROM_EMAIL, MAIL_FROM_NAME
 *
 * GTM kill switch (set in Render env, default false):
 *   CLAIM_OTP_LIVE_OUTREACH=true   → sends to real recipient
 *   CLAIM_OTP_LIVE_OUTREACH=false  → redirects to DEV_OTP_INBOX
 *   DEV_OTP_INBOX=dev@cardbey.com  → dev redirect target
 */

import { sendMail } from './mailer.js';

// ── Config ────────────────────────────────────────────────────────────────────

const OTP_TTL_MINUTES = 10;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a claim OTP email via Cardbey's existing SMTP mailer.
 *
 * @param {{ email: string, otp?: string, code?: string, businessName?: string | null }} params
 * @returns {Promise<{ ok: boolean, recipient: string, redirected: boolean, skipped?: boolean, error?: string }>}
 */
export async function sendClaimOtpEmail({ email, otp, code, businessName }) {
  // GTM kill switch — redirect all OTPs to dev inbox unless live outreach is
  // explicitly enabled. CLAIM_OTP_LIVE_OUTREACH=false is the safe default.
  const liveOutreach =
    process.env.CLAIM_OTP_LIVE_OUTREACH === 'true' ||
    process.env.CLAIM_OTP_LIVE_OUTREACH === '1';
  const requested = String(email || '').trim().toLowerCase();
  const recipient = liveOutreach
    ? requested
    : String(process.env.DEV_OTP_INBOX ?? 'dev@cardbey.com').trim().toLowerCase();
  const redirected = recipient !== requested;
  const otpCode = String(otp ?? code ?? '').trim();
  const displayName = businessName || 'your business';

  if (redirected) {
    console.warn(
      `[ClaimOtp] Redirecting OTP from ${email} → ${recipient} (live outreach disabled)`
    );
  }

  const result = await sendMail({
    to: recipient,
    subject: `Your code to claim ${displayName} on Cardbey`,
    html: buildHtml({ code: otpCode, businessName: displayName }),
    text: buildText({ code: otpCode, businessName: displayName }),
    bypassEnableGate: true,
  });

  if (result.skipped) {
    return { ok: true, recipient, redirected, skipped: true };
  }

  if (!result.ok) {
    return {
      ok: false,
      recipient,
      redirected,
      error: result.error || 'Failed to send OTP email.',
    };
  }

  return { ok: true, recipient, redirected, skipped: false };
}

// ── Email templates ───────────────────────────────────────────────────────────

function buildHtml({ code, businessName }) {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0b0b0b">
      <p style="font-size:14px;color:#52514e;margin:0 0 24px">
        Someone (hopefully you) requested to claim
        <strong style="color:#0b0b0b">${escapeHtml(businessName)}</strong>
        on Cardbey.
      </p>

      <div style="background:#f5f4f0;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px">
        <p style="font-size:12px;color:#898781;margin:0 0 8px;
                  letter-spacing:.08em;text-transform:uppercase">
          Your claim code
        </p>
        <p style="font-size:36px;font-weight:600;letter-spacing:.25em;
                  color:#0b0b0b;margin:0;font-family:monospace">
          ${escapeHtml(code)}
        </p>
        <p style="font-size:12px;color:#898781;margin:8px 0 0">
          Valid for ${OTP_TTL_MINUTES} minutes
        </p>
      </div>

      <p style="font-size:13px;color:#898781;margin:0 0 8px">
        If you didn't request this, you can safely ignore this email.
        Nobody can claim this store without the code.
      </p>

      <p style="font-size:12px;color:#c0bebb;margin:24px 0 0;
                border-top:1px solid #eee;padding-top:16px">
        Cardbey · Melbourne, Australia
      </p>
    </div>
  `;
}

function buildText({ code, businessName }) {
  return [
    `You requested to claim ${businessName} on Cardbey.`,
    ``,
    `Your claim code: ${code}`,
    `Valid for ${OTP_TTL_MINUTES} minutes.`,
    ``,
    `If you didn't request this, ignore this email.`,
  ].join('\n');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}