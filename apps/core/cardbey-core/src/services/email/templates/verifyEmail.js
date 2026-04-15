/**
 * Verification email template – subject + HTML.
 * Link format: API base + /api/auth/verify/confirm?token=<raw>&redirect_uri=/onboarding/business?verified=1
 */

const SUBJECT = 'Confirm your Cardbey account';

/**
 * @param {{ verifyLink: string, displayName?: string }} options
 * @returns {{ subject: string, html: string }}
 */
export function getVerifyEmailContent({ verifyLink, displayName }) {
  const name = displayName || 'there';
  const safeHref = verifyLink.replace(/"/g, '&quot;');
  const linkDisplay = escapeHtml(verifyLink);
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;font-family:sans-serif;background:#f5f5f5;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e3e3e3;border-radius:8px;padding:32px">
    <h1 style="margin:0 0 16px;font-size:20px">Activate your account</h1>
    <p style="margin:0 0 16px">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 16px">Please click the button below to verify your email and activate your Cardbey account.</p>
    <p style="margin:0 0 24px">
      <a href="${safeHref}" style="display:inline-block;padding:12px 24px;background:#0ea5e9;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Verify email</a>
    </p>
    <p style="margin:0;font-size:14px;color:#64748b">Or copy this link: <a href="${safeHref}">${linkDisplay}</a></p>
  </div>
</body>
</html>`.trim();

  return { subject: SUBJECT, html };
}

function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
