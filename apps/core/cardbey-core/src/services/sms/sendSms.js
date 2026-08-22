/**
 * Thin Twilio SMS adapter — best-effort, never throws.
 * Skips when TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER missing.
 */

function parseBool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const v = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return fallback;
}

/**
 * Normalize to E.164 when possible (VN local 0… → +84…).
 * @param {string} phone
 * @param {{ defaultCountry?: 'VN' | 'AU' | null }} [opts]
 * @returns {string | null}
 */
export function toE164Phone(phone, opts = {}) {
  const raw = String(phone || '').trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  if (hasPlus) return `+${digits}`;

  const country = opts.defaultCountry || null;
  if (country === 'VN') {
    if (digits.startsWith('84') && digits.length >= 10) return `+${digits}`;
    if (digits.startsWith('0') && digits.length >= 9) return `+84${digits.slice(1)}`;
    if (digits.length >= 8 && digits.length <= 10) return `+84${digits}`;
  }
  if (country === 'AU') {
    if (digits.startsWith('61')) return `+${digits}`;
    if (digits.startsWith('0')) return `+61${digits.slice(1)}`;
  }
  // Without country hint, only accept numbers that already look international.
  if (digits.length >= 11) return `+${digits}`;
  return null;
}

/**
 * @param {{ to: string, body: string, defaultCountry?: 'VN' | 'AU' | null }} options
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: string, sid?: string }>}
 */
export async function sendSms({ to, body, defaultCountry = 'VN' }) {
  const sid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  const from = String(process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || '').trim();

  if (!sid || !token || !from) {
    console.log('[Sms] Skipped (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER not set)');
    return { ok: false, skipped: true };
  }

  const e164 = toE164Phone(to, { defaultCountry });
  if (!e164) {
    console.warn('[Sms] Skipped (could not normalize phone to E.164)');
    return { ok: false, skipped: true, error: 'invalid_phone' };
  }

  // Optional hard kill for all SMS from this adapter.
  if (parseBool(process.env.ENABLE_SMS, true) === false) {
    console.log('[Sms] Skipped (ENABLE_SMS=false)');
    return { ok: false, skipped: true };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const form = new URLSearchParams({
    To: e164,
    From: from,
    Body: String(body || '').slice(0, 1600),
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[Sms] Send failed', {
        status: res.status,
        code: json?.code,
        message: json?.message ? String(json.message).slice(0, 120) : undefined,
      });
      return { ok: false, error: json?.message || `http_${res.status}` };
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Sms] Sent', { sid: json?.sid });
    }
    return { ok: true, sid: json?.sid };
  } catch (err) {
    console.error('[Sms] Send failed', { error: err?.message });
    return { ok: false, error: err?.message || 'send_failed' };
  }
}
