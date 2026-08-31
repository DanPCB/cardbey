/**
 * Global Live EOI confirmation email templates (EN/VI).
 * Application receipt (V2) is the default confirmation design.
 * "Track your application" CTA only when ENABLE_GLOBAL_LIVE_EOI_APPLICANT_TRACKING_V1 is on.
 */

import { publicWebBase as resolvePublicWebBase } from '../../utils/publicWebBase.js';
import {
  applicantStatusLabel,
  GLOBAL_LIVE_EOI_APPLICANT_STATUS,
  GLOBAL_LIVE_EOI_STATUS,
  pilotDisplayName,
  showcaseTypeLabels,
  toApplicantStatus,
  applicantNextStep,
} from './domain.js';
import { isEoiApplicantTrackingEnabled } from './flags.js';

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function webBase() {
  try {
    return resolvePublicWebBase({ emptyInProductionIfUnset: false }) || 'https://cardbey.com';
  } catch {
    return 'https://cardbey.com';
  }
}

function supportEmail() {
  return String(process.env.MAIL_REPLY_TO || process.env.MAIL_FROM_EMAIL || 'support@cardbey.com').trim();
}

function absoluteUrl(pathAndQuery) {
  const base = webBase().replace(/\/+$/, '');
  const path = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
  return `${base}${path}`;
}

function authUrl(mode, returnTo) {
  const safeReturn = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/me';
  return absoluteUrl(`/login?mode=${mode}&returnTo=${encodeURIComponent(safeReturn)}`);
}

function formatSubmittedAt(value, locale) {
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-AU', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(d);
  } catch {
    return '—';
  }
}

/**
 * Legacy V1 body (used when CONFIRMATION_EMAIL_V2 is off).
 */
function buildV1(reg, locale) {
  const vi = locale === 'vi';
  const name = String(reg?.name || '').trim() || (vi ? 'bạn' : 'there');
  const business = String(reg?.businessName || '').trim() || (vi ? 'doanh nghiệp của bạn' : 'your business');
  const subject = vi
    ? 'Cardbey đã nhận đăng ký Global Live của bạn'
    : 'Cardbey received your Global Live registration';
  const text = vi
    ? [
        `Xin chào ${name},`,
        '',
        `Cảm ơn bạn đã đăng ký thí điểm Cardbey Global Live cho ${business}.`,
        'Chúng tôi sẽ xem xét hồ sơ và liên hệ nếu doanh nghiệp phù hợp.',
        'Đăng ký không đảm bảo được chọn.',
        '',
        '— Cardbey',
      ].join('\n')
    : [
        `Hi ${name},`,
        '',
        `Thanks for registering ${business} for the Cardbey Global Live pilot.`,
        'We will review your application and contact you if it is a fit.',
        'Registration does not guarantee selection.',
        '',
        '— Cardbey',
      ].join('\n');
  const html = vi
    ? `<p>Xin chào ${escapeHtml(name)},</p>
<p>Cảm ơn bạn đã đăng ký thí điểm <strong>Cardbey Global Live</strong> cho <strong>${escapeHtml(business)}</strong>.</p>
<p>Chúng tôi sẽ xem xét hồ sơ và liên hệ nếu doanh nghiệp phù hợp. Đăng ký không đảm bảo được chọn.</p>
<p style="color:#666;font-size:12px">— Cardbey</p>`
    : `<p>Hi ${escapeHtml(name)},</p>
<p>Thanks for registering <strong>${escapeHtml(business)}</strong> for the <strong>Cardbey Global Live</strong> pilot.</p>
<p>We will review your application and contact you if it is a fit. Registration does not guarantee selection.</p>
<p style="color:#666;font-size:12px">— Cardbey</p>`;
  return {
    subject,
    preheader: vi
      ? 'Hồ sơ của bạn đã được nhận.'
      : 'Your application has been received.',
    html: html.trim(),
    text,
    locale,
    replyTo: supportEmail(),
  };
}

/**
 * Application receipt V2 (flag-gated).
 * @param {{
 *   name?: string | null,
 *   businessName?: string | null,
 *   language?: string | null,
 *   pilotId?: string | null,
 *   publicReference?: string | null,
 *   createdAt?: Date | string | null,
 *   submittedAt?: Date | string | null,
 *   showcaseTypes?: unknown,
 *   status?: string | null,
 *   hasLinkedBusiness?: boolean,
 *   userId?: string | null,
 * }} reg
 */
export function buildEoiConfirmationEmailV2(reg) {
  const lang = String(reg?.language || '').toLowerCase();
  const locale = !lang || lang.startsWith('vi') ? 'vi' : 'en';
  const vi = locale === 'vi';
  const name = String(reg?.name || '').trim() || (vi ? 'bạn' : 'there');
  const business = String(reg?.businessName || '').trim() || (vi ? 'doanh nghiệp của bạn' : 'your business');
  const publicReference = String(reg?.publicReference || '').trim() || (vi ? 'đang cập nhật' : 'pending');
  const pilot = pilotDisplayName(reg?.pilotId, locale);
  const receiptStatus = applicantStatusLabel(GLOBAL_LIVE_EOI_APPLICANT_STATUS.RECEIVED, locale);
  const types = showcaseTypeLabels(reg?.showcaseTypes, locale).join(', ') || '—';
  const submittedAt = formatSubmittedAt(reg?.submittedAt || reg?.createdAt || new Date(), locale);
  const preferredLanguage = reg?.language || (vi ? 'vi' : 'en');
  const trackingOn = isEoiApplicantTrackingEnabled();
  const hasLinkedAccount = Boolean(reg?.userId);
  const hasLinkedBusiness = Boolean(reg?.hasLinkedBusiness || reg?.storeId);
  const trackPath = '/me/global-live-applications';
  const signupUrl = authUrl('signup', trackingOn ? trackPath : '/for-sellers');
  const trackUrl = absoluteUrl(trackPath);
  const updateBusinessUrl = absoluteUrl('/for-sellers');
  const globalLiveUrl = absoluteUrl('/global-live');
  const termsUrl = absoluteUrl('/terms');
  const privacyUrl = absoluteUrl('/privacy');
  const support = supportEmail();

  const subject = vi
    ? 'Cardbey đã nhận hồ sơ đăng ký thí điểm Global Live của bạn'
    : 'Cardbey has received your Global Live pilot application';

  const preheader = trackingOn
    ? vi
      ? 'Hồ sơ của bạn đã được nhận. Theo dõi trạng thái hồ sơ và chuẩn bị doanh nghiệp trên Cardbey.'
      : 'Your application has been received. Track your application status and prepare your business on Cardbey.'
    : vi
      ? 'Hồ sơ của bạn đã được nhận. Trạng thái công khai: Đã nhận. Đăng ký không đảm bảo được chọn.'
      : 'Your application has been received. Public status: Received. Applying does not guarantee selection.';

  const heading = vi ? 'Cảm ơn bạn — hồ sơ đã được nhận' : 'Thank you — your application has been received';
  const nextHeading = vi ? 'Điều gì sẽ xảy ra tiếp theo?' : 'What happens next?';
  const nextSteps = vi
    ? [
        'Cardbey sẽ xem xét thông tin doanh nghiệp và nội dung bạn muốn trình bày.',
        'Chúng tôi sẽ liên hệ với các doanh nghiệp phù hợp để trao đổi về bước tiếp theo.',
        'Nếu được chọn, bạn sẽ được hướng dẫn chuẩn bị gian hàng và phiên Global Live.',
      ]
    : [
        'Cardbey will review your business information and what you would like to present.',
        'We will contact suitable businesses to discuss next steps.',
        'If selected, you will be guided to prepare your storefront and Global Live session.',
      ];
  const disclaimer = vi
    ? 'Việc gửi hồ sơ không đảm bảo doanh nghiệp sẽ được chọn tham gia thí điểm. Phát sóng Global Live và dịch thuật chưa vận hành.'
    : 'Submitting an application does not guarantee selection for the pilot. Global Live broadcasting and translation are not yet operational.';

  let ctaPrimaryLabel;
  let ctaPrimaryUrl;
  let ctaSupport;
  let ctaSecondaryLabel = null;
  let ctaSecondaryUrl = null;

  if (trackingOn && hasLinkedAccount) {
    ctaPrimaryLabel = vi ? 'Xem trạng thái hồ sơ' : 'View application status';
    ctaPrimaryUrl = trackUrl;
    ctaSupport = vi
      ? 'Đăng nhập vào tài khoản Cardbey đã liên kết để xem trạng thái hồ sơ công khai.'
      : 'Sign in to your linked Cardbey account to view the public-safe application status.';
    ctaSecondaryLabel = vi ? 'Cập nhật doanh nghiệp Cardbey của bạn' : 'Update your Cardbey business';
    ctaSecondaryUrl = updateBusinessUrl;
  } else if (trackingOn) {
    ctaPrimaryLabel = vi
      ? 'Tạo tài khoản Cardbey để chuẩn bị doanh nghiệp'
      : 'Create your Cardbey account to prepare your business';
    ctaPrimaryUrl = signupUrl;
    ctaSupport = vi
      ? 'Tạo tài khoản để xây dựng hồ sơ doanh nghiệp và theo dõi trạng thái khi email đã xác minh khớp hồ sơ. Tạo tài khoản không đảm bảo được chọn.'
      : 'Create an account to build your business profile and track status once your verified email matches. Creating an account does not guarantee selection.';
  } else if (hasLinkedBusiness) {
    ctaPrimaryLabel = vi ? 'Cập nhật doanh nghiệp Cardbey của bạn' : 'Update your Cardbey business';
    ctaPrimaryUrl = updateBusinessUrl;
    ctaSupport = vi
      ? 'Cập nhật gian hàng không thay đổi trạng thái hồ sơ EOI và không đảm bảo được chọn.'
      : 'Updating your business does not change EOI status and does not guarantee selection.';
  } else {
    ctaPrimaryLabel = vi
      ? 'Tạo tài khoản Cardbey để chuẩn bị doanh nghiệp'
      : 'Create your Cardbey account to prepare your business';
    ctaPrimaryUrl = signupUrl;
    ctaSupport = vi
      ? 'Tạo tài khoản để xây dựng hồ sơ doanh nghiệp và chuẩn bị cho Global Live. Tạo tài khoản không đảm bảo được chọn.'
      : 'Create an account to build your business profile and prepare for Global Live. Creating an account does not guarantee selection.';
  }

  const text = [
    vi ? `Xin chào ${name},` : `Hi ${name},`,
    '',
    heading,
    vi
      ? `Cardbey đã nhận hồ sơ đăng ký tham gia thí điểm Global Live của ${business}.`
      : `Cardbey has received the Global Live pilot application for ${business}.`,
    '',
    vi ? `Trạng thái: ${receiptStatus}` : `Status: ${receiptStatus}`,
    vi ? `Doanh nghiệp: ${business}` : `Business: ${business}`,
    vi ? `Chương trình: ${pilot}` : `Pilot: ${pilot}`,
    vi ? `Mã hồ sơ: ${publicReference}` : `Application reference: ${publicReference}`,
    vi ? `Ngày gửi: ${submittedAt}` : `Submitted: ${submittedAt}`,
    vi
      ? `Ngôn ngữ trình bày ưu tiên: ${preferredLanguage}`
      : `Preferred presentation language: ${preferredLanguage}`,
    vi ? `Nội dung muốn trình bày: ${types}` : `Intended presentation types: ${types}`,
    '',
    nextHeading,
    ...nextSteps.map((s, i) => `${i + 1}. ${s}`),
    '',
    disclaimer,
    '',
    ctaPrimaryLabel,
    ctaPrimaryUrl,
    ctaSupport,
    ...(ctaSecondaryLabel && ctaSecondaryUrl ? ['', ctaSecondaryLabel, ctaSecondaryUrl] : []),
    '',
    vi ? `Trang Global Live: ${globalLiveUrl}` : `Global Live page: ${globalLiveUrl}`,
    vi ? `Điều khoản: ${termsUrl}` : `Terms: ${termsUrl}`,
    vi ? `Chính sách quyền riêng tư: ${privacyUrl}` : `Privacy Policy: ${privacyUrl}`,
    vi ? `Hỗ trợ: ${support}` : `Support: ${support}`,
    '',
    '— Cardbey',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:24px 28px 8px;text-align:center;border-bottom:1px solid #f1f5f9;">
          <div style="font-size:20px;font-weight:700;">Cardbey</div>
          <div style="margin-top:4px;font-size:13px;font-weight:600;color:#475569;">Global Live</div>
        </td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">${vi ? `Xin chào ${escapeHtml(name)},` : `Hi ${escapeHtml(name)},`}</p>
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">${escapeHtml(heading)}</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#334155;">
            ${
              vi
                ? `Cardbey đã nhận hồ sơ đăng ký tham gia thí điểm Global Live của <strong>${escapeHtml(business)}</strong>.`
                : `Cardbey has received the Global Live pilot application for <strong>${escapeHtml(business)}</strong>.`
            }
          </p>
          <table role="presentation" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin:0 0 24px;">
            <tr><td style="padding:16px 18px;font-size:14px;line-height:1.6;">
              <div><strong>${vi ? 'Trạng thái' : 'Status'}:</strong> ${escapeHtml(receiptStatus)}</div>
              <div><strong>${vi ? 'Doanh nghiệp' : 'Business'}:</strong> ${escapeHtml(business)}</div>
              <div><strong>${vi ? 'Chương trình' : 'Pilot'}:</strong> ${escapeHtml(pilot)}</div>
              <div><strong>${vi ? 'Mã hồ sơ' : 'Application reference'}:</strong> ${escapeHtml(publicReference)}</div>
              <div><strong>${vi ? 'Ngày gửi' : 'Submitted'}:</strong> ${escapeHtml(submittedAt)}</div>
              <div><strong>${vi ? 'Ngôn ngữ trình bày ưu tiên' : 'Preferred presentation language'}:</strong> ${escapeHtml(preferredLanguage)}</div>
              <div><strong>${vi ? 'Nội dung muốn trình bày' : 'Intended presentation types'}:</strong> ${escapeHtml(types)}</div>
            </td></tr>
          </table>
          <h2 style="margin:0 0 10px;font-size:17px;">${escapeHtml(nextHeading)}</h2>
          <ol style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.6;color:#334155;">
            ${nextSteps.map((s) => `<li style="margin-bottom:6px;">${escapeHtml(s)}</li>`).join('')}
          </ol>
          <p style="margin:0 0 24px;font-size:13px;line-height:1.55;color:#64748b;">${escapeHtml(disclaimer)}</p>
          <p style="margin:0 0 12px;">
            <a href="${escapeHtml(ctaPrimaryUrl)}" style="display:inline-block;padding:12px 22px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;">${escapeHtml(ctaPrimaryLabel)}</a>
          </p>
          <p style="margin:0 0 16px;font-size:13px;line-height:1.55;color:#475569;">${escapeHtml(ctaSupport)}</p>
          ${
            ctaSecondaryLabel && ctaSecondaryUrl
              ? `<p style="margin:0 0 16px;"><a href="${escapeHtml(ctaSecondaryUrl)}" style="font-size:14px;font-weight:600;color:#0f172a;">${escapeHtml(ctaSecondaryLabel)}</a></p>`
              : ''
          }
          <p style="margin:0;font-size:13px;"><a href="${escapeHtml(globalLiveUrl)}" style="color:#334155;">${vi ? 'Quay lại trang Global Live' : 'Back to the Global Live page'}</a></p>
        </td></tr>
        <tr><td style="padding:18px 28px 28px;border-top:1px solid #f1f5f9;font-size:12px;line-height:1.5;color:#64748b;">
          <p style="margin:0 0 8px;">${vi ? 'Giữ thông tin doanh nghiệp trên Cardbey luôn cập nhật.' : 'Keep your Cardbey business information up to date.'}</p>
          <p style="margin:0;">
            <a href="${escapeHtml(termsUrl)}" style="color:#475569;">${vi ? 'Điều khoản' : 'Terms'}</a>
            &nbsp;·&nbsp;
            <a href="${escapeHtml(privacyUrl)}" style="color:#475569;">${vi ? 'Chính sách quyền riêng tư' : 'Privacy Policy'}</a>
            &nbsp;·&nbsp;
            <a href="mailto:${escapeHtml(support)}" style="color:#475569;">${escapeHtml(support)}</a>
          </p>
          <p style="margin:12px 0 0;color:#94a3b8;">— Cardbey</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  return {
    subject,
    preheader,
    html,
    text,
    locale,
    replyTo: support,
    primaryCtaLabel: ctaPrimaryLabel,
  };
}

/**
 * Public builder used by sendEoiConfirmation.
 * Application-receipt (V2) content is always used. Legacy V1 remains available as buildV1
 * for reference. ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_EMAIL_V2 is retained as a no-op
 * compatibility flag (see flags.js / health diagnostics).
 */
export function buildEoiConfirmationEmail(reg) {
  return buildEoiConfirmationEmailV2(reg);
}

/** @deprecated Prefer applicantStatusLabel via domain */
export function legacyStatusHelpers() {
  return {
    toApplicantStatus,
    applicantStatusLabel,
    applicantNextStep,
    GLOBAL_LIVE_EOI_STATUS,
  };
}
