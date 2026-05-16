/**
 * Mailer adapter – SMTP via nodemailer.
 * When ENABLE_EMAIL_VERIFICATION is false or MAIL_HOST is missing, sendMail logs and returns { ok: false, skipped: true }.
 */

import nodemailer from 'nodemailer';

const ENABLED = process.env.ENABLE_EMAIL_VERIFICATION === 'true' || process.env.ENABLE_EMAIL_VERIFICATION === '1';
const MAIL_HOST = process.env.MAIL_HOST || '';

let transporter = null;

function getTransporter() {
  if (transporter !== null) return transporter;
  if (!ENABLED || !MAIL_HOST.trim()) return null;
  const insecureTls = process.env.MAIL_INSECURE_TLS === 'true' || process.env.MAIL_INSECURE_TLS === '1';
  transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT ? parseInt(process.env.MAIL_PORT, 10) : 587,
    secure: process.env.MAIL_SECURE === 'true' || process.env.MAIL_SECURE === '1',
    auth: process.env.MAIL_USER && process.env.MAIL_PASS
      ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
      : undefined,
    ...(insecureTls && {
      tls: { rejectUnauthorized: false },
    }),
  });
  return transporter;
}

/**
 * Send an email. Does not throw.
 * @param {{ to: string, subject: string, html: string, text?: string }} options
 * @returns {{ ok: boolean, skipped?: boolean, error?: string }}
 */
export async function sendMail({ to, subject, html, text }) {
  if (!ENABLED || !MAIL_HOST.trim()) {
    console.log('[Mailer] Skipped (ENABLE_EMAIL_VERIFICATION off or MAIL_HOST not set)', { to, subject: subject?.slice(0, 40) });
    return { ok: false, skipped: true };
  }

  const transport = getTransporter();
  if (!transport) {
    return { ok: false, skipped: true };
  }

  const from = `${process.env.MAIL_FROM_NAME || 'Cardbey'} <${process.env.MAIL_FROM_EMAIL || 'no-reply@cardbey.com'}>`;

  try {
    const info = await transport.sendMail({
      from,
      to,
      subject: subject || 'Cardbey',
      html: html || '',
      text: text || undefined,
    });
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Mailer] Sent', { to, messageId: info?.messageId });
    }
    return { ok: true, messageId: info?.messageId };
  } catch (err) {
    console.error('[Mailer] Send failed', { to, error: err?.message });
    return { ok: false, error: err?.message };
  }
}
