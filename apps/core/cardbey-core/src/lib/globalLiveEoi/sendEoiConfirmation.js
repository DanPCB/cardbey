/**
 * Global Live EOI registrant confirmation (email + optional SMS).
 * Best-effort: never throws; never blocks create success.
 * Email idempotency: skip when confirmationEmailStatus === 'sent' on the row.
 * SMS is opt-in via ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_SMS (default OFF).
 */

import { sendMail } from '../../services/email/mailer.js';
import { sendSms } from '../../services/sms/sendSms.js';
import { buildEoiConfirmationEmail } from './confirmationEmailTemplates.js';

function parseBool(value, fallback) {
  if (value == null || value === '') return fallback;
  const v = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return fallback;
}

function confirmationsEnabled() {
  return parseBool(process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATIONS, true);
}

function smsConfirmationsEnabled() {
  return parseBool(process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_SMS, false);
}

/**
 * @param {{
 *   name?: string | null,
 *   businessName?: string | null,
 *   email?: string | null,
 *   phone?: string | null,
 *   language?: string | null,
 *   country?: string | null,
 *   pilotId?: string | null,
 *   registrationId?: string | null,
 *   publicReference?: string | null,
 *   createdAt?: Date | string | null,
 *   showcaseTypes?: unknown,
 *   status?: string | null,
 *   storeId?: string | null,
 *   confirmationEmailStatus?: string | null,
 * }} registration
 * @returns {Promise<{ email: { ok: boolean, skipped?: boolean, error?: string }, sms: { ok: boolean, skipped?: boolean, error?: string } }>}
 */
export async function sendEoiConfirmation(registration) {
  if (!confirmationsEnabled()) {
    console.log('[GlobalLiveEoi] Confirmations disabled (ENABLE_GLOBAL_LIVE_EOI_CONFIRMATIONS=false)');
    return {
      email: { ok: false, skipped: true },
      sms: { ok: false, skipped: true },
    };
  }

  // Row-level idempotency (sync send; full outbox deferred).
  if (String(registration?.confirmationEmailStatus || '') === 'sent') {
    console.log('[GlobalLiveEoi] Confirmation email already sent — skip', {
      registrationId: registration?.registrationId || null,
    });
    return {
      email: { ok: true, skipped: true },
      sms: { ok: false, skipped: true },
    };
  }

  const email = String(registration?.email || '').trim();
  const phone = String(registration?.phone || '').trim();
  const countryRaw = String(registration?.country || '').toLowerCase();
  const defaultCountry = countryRaw.includes('australia') || countryRaw === 'au' ? 'AU' : 'VN';

  const template = buildEoiConfirmationEmail({
    name: registration?.name,
    businessName: registration?.businessName,
    language: registration?.language,
    pilotId: registration?.pilotId,
    publicReference: registration?.publicReference,
    createdAt: registration?.createdAt,
    submittedAt: registration?.submittedAt || registration?.createdAt,
    showcaseTypes: registration?.showcaseTypes,
    status: registration?.status,
    hasLinkedBusiness: Boolean(registration?.storeId),
    userId: registration?.userId || null,
  });

  const emailResult = email
    ? await sendMail({
        to: email,
        subject: template.subject,
        html: template.html,
        text: template.text,
        bypassEnableGate: true,
        replyTo: template.replyTo,
      })
    : { ok: false, skipped: true, error: 'missing_email' };

  let smsResult = { ok: false, skipped: true };
  if (!smsConfirmationsEnabled()) {
    smsResult = { ok: false, skipped: true, error: 'sms_disabled' };
  } else if (!phone) {
    smsResult = { ok: false, skipped: true, error: 'missing_phone' };
  } else {
    const business = String(registration?.businessName || '').trim() || 'business';
    const vi = template.locale === 'vi';
    const smsBody = vi
      ? `Cardbey: Da nhan ho so Global Live (${registration?.publicReference || ''}). Dang ky khong dam bao duoc chon.`
      : `Cardbey: Global Live application received (${registration?.publicReference || ''}). Applying does not guarantee selection.`;
    smsResult = await sendSms({ to: phone, body: smsBody, defaultCountry });
  }

  console.log('[GlobalLiveEoi] Confirmation attempted', {
    registrationId: registration?.registrationId || null,
    publicReference: registration?.publicReference || null,
    pilotId: registration?.pilotId || null,
    email: emailResult.ok ? 'sent' : emailResult.skipped ? 'skipped' : 'failed',
    sms: smsResult.ok ? 'sent' : smsResult.skipped ? 'skipped' : 'failed',
  });

  return { email: emailResult, sms: smsResult };
}

export function confirmationStatusFromResult(emailResult) {
  if (!emailResult) return 'failed';
  if (emailResult.ok && !emailResult.skipped) return 'sent';
  if (emailResult.skipped) return 'skipped';
  return 'failed';
}
