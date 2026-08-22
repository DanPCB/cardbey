/**
 * Cardbey Global Live — Pilot EOI domain (marketing lead; not Live Market session RSVP).
 */

import { z } from 'zod';

export const GLOBAL_LIVE_EOI_ERROR_CODES = Object.freeze({
  DISABLED: 'GLOBAL_LIVE_EOI_DISABLED',
  CLOSED: 'GLOBAL_LIVE_EOI_CLOSED',
  VALIDATION: 'GLOBAL_LIVE_EOI_VALIDATION',
  NOT_FOUND: 'GLOBAL_LIVE_EOI_NOT_FOUND',
  UNKNOWN_PILOT: 'GLOBAL_LIVE_EOI_UNKNOWN_PILOT',
  UNKNOWN: 'GLOBAL_LIVE_EOI_ERROR',
});

export const GLOBAL_LIVE_EOI_STATUS = Object.freeze({
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  SHORTLISTED: 'SHORTLISTED',
  SELECTED: 'SELECTED',
  WAITLISTED: 'WAITLISTED',
  DECLINED: 'DECLINED',
  WITHDRAWN: 'WITHDRAWN',
});

export const GLOBAL_LIVE_EOI_STATUSES = Object.freeze(Object.values(GLOBAL_LIVE_EOI_STATUS));

export const SHOWCASE_TYPES = Object.freeze([
  'products',
  'services',
  'business_story',
  'demonstration',
  'promotion_offer',
  'other',
]);

export const EXISTING_CARDBEY_BUSINESS = Object.freeze(['yes', 'no', 'not_sure']);

/**
 * Known pilots. API accepts pilotId so corridors are not hard-coded in handlers.
 * Add new pilots here without schema changes.
 */
export const GLOBAL_LIVE_EOI_PILOTS = Object.freeze({
  vn_au_global_live_v1: Object.freeze({
    id: 'vn_au_global_live_v1',
    label: 'Vietnam → Australia',
    originMarket: 'VN',
    targetMarket: 'AU',
    capacitySelected: 20,
    defaultCountry: 'Vietnam',
  }),
});

export const DEFAULT_GLOBAL_LIVE_EOI_PILOT_ID = 'vn_au_global_live_v1';

/** Soft dedupe window for same pilot + email (ms). */
export const EOI_DEDUPE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function resolvePilot(pilotId) {
  const id = String(pilotId || DEFAULT_GLOBAL_LIVE_EOI_PILOT_ID).trim();
  const pilot = GLOBAL_LIVE_EOI_PILOTS[id] || null;
  return { id, pilot };
}

export function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

export function normalizePhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  // Keep leading +, strip spaces/dashes/parens; retain digits.
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/[^\d]/g, '');
  return hasPlus ? `+${digits}` : digits;
}

export function sanitizeText(value, maxLen) {
  const s = String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();
  if (!maxLen || s.length <= maxLen) return s;
  return s.slice(0, maxLen);
}

export function isValidBusinessUrl(value) {
  if (value == null || String(value).trim() === '') return true;
  const raw = String(value).trim();
  if (raw.length > 500) return false;
  // Allow bare domains and common social URLs (facebook/zalo/cardbey).
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (!u.hostname || u.hostname.length < 2) return false;
    return true;
  } catch {
    return false;
  }
}

export function normalizeBusinessUrl(value) {
  if (value == null || String(value).trim() === '') return null;
  const raw = sanitizeText(value, 500);
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

const attributionField = z
  .string()
  .trim()
  .max(200)
  .optional()
  .nullable()
  .transform((v) => (v == null || v === '' ? null : v));

export const GlobalLiveEoiSubmitSchema = z
  .object({
    pilotId: z.string().trim().min(1).max(80).optional().nullable(),
    name: z.string().trim().min(1).max(120),
    businessName: z.string().trim().min(1).max(200),
    industry: z.string().trim().min(1).max(120),
    city: z.string().trim().min(1).max(120),
    country: z.string().trim().min(1).max(120).optional().nullable(),
    phone: z.string().trim().min(5).max(40),
    email: z.string().trim().email().max(200),
    showcaseTypes: z
      .array(z.enum(SHOWCASE_TYPES))
      .min(1)
      .max(SHOWCASE_TYPES.length),
    businessDescription: z.string().trim().min(1).max(2000),
    existingCardbeyBusiness: z.enum(EXISTING_CARDBEY_BUSINESS),
    businessUrl: z.string().trim().max(500).optional().nullable(),
    language: z.string().trim().max(16).optional().nullable(),
    source: attributionField,
    campaign: attributionField,
    utmSource: attributionField,
    utmMedium: attributionField,
    utmCampaign: attributionField,
    utmContent: attributionField,
    referrer: z
      .string()
      .trim()
      .max(500)
      .optional()
      .nullable()
      .transform((v) => (v == null || v === '' ? null : v)),
    socialProvider: attributionField,
    consentGranted: z.literal(true),
    /** Client may suggest; server only binds from session. */
    storeId: z.string().trim().max(80).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!isValidBusinessUrl(data.businessUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid business URL',
        path: ['businessUrl'],
      });
    }
  });

export const GlobalLiveEoiStatusPatchSchema = z.object({
  status: z.enum(GLOBAL_LIVE_EOI_STATUSES),
});

export function toPublicPilotDto(pilot) {
  if (!pilot) return null;
  return {
    id: pilot.id,
    label: pilot.label,
    originMarket: pilot.originMarket,
    targetMarket: pilot.targetMarket,
    capacitySelected: pilot.capacitySelected,
    defaultCountry: pilot.defaultCountry,
  };
}

export function toAdminEoiDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    publicReference: row.publicReference ?? null,
    pilotId: row.pilotId,
    userId: row.userId ?? null,
    storeId: row.storeId ?? null,
    name: row.name,
    businessName: row.businessName,
    industry: row.industry,
    city: row.city,
    country: row.country,
    phone: row.phone,
    email: row.email,
    showcaseTypes: Array.isArray(row.showcaseTypes) ? row.showcaseTypes : [],
    businessDescription: row.businessDescription,
    existingCardbeyBusiness: row.existingCardbeyBusiness,
    businessUrl: row.businessUrl ?? null,
    language: row.language ?? null,
    source: row.source ?? null,
    campaign: row.campaign ?? null,
    utmSource: row.utmSource ?? null,
    utmMedium: row.utmMedium ?? null,
    utmCampaign: row.utmCampaign ?? null,
    utmContent: row.utmContent ?? null,
    referrer: row.referrer ?? null,
    socialProvider: row.socialProvider ?? null,
    consentGranted: Boolean(row.consentGranted),
    consentAt: row.consentAt ? new Date(row.consentAt).toISOString() : null,
    consentVersion: row.consentVersion ?? null,
    privacyVersion: row.privacyVersion ?? null,
    termsVersion: row.termsVersion ?? null,
    consentLocale: row.consentLocale ?? null,
    consentContext: row.consentContext ?? null,
    consentTextHash: row.consentTextHash ?? null,
    consentEvidence: {
      versioned: Boolean(row.consentVersion && row.consentTextHash),
      label: row.consentVersion && row.consentTextHash ? 'versioned' : 'legacy_unversioned',
    },
    businessLink: row.storeId
      ? { linked: true, storeId: row.storeId }
      : { linked: false, storeId: null },
    status: row.status,
    confirmationEmailStatus: row.confirmationEmailStatus ?? null,
    confirmationSentAt: row.confirmationSentAt
      ? new Date(row.confirmationSentAt).toISOString()
      : null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

/** Applicant-facing public status codes (mapped from internal EOI status). */
export const GLOBAL_LIVE_EOI_APPLICANT_STATUS = Object.freeze({
  RECEIVED: 'received',
  REVIEWING: 'reviewing',
  SHORTLISTED: 'shortlisted',
  SELECTED: 'selected',
  WAITLISTED: 'waitlisted',
  CLOSED: 'closed',
  WITHDRAWN: 'withdrawn',
});

/**
 * Map internal status → public-safe applicant status (no inventing progress).
 * @param {string} internalStatus
 */
export function toApplicantStatus(internalStatus) {
  switch (String(internalStatus || '')) {
    case GLOBAL_LIVE_EOI_STATUS.SUBMITTED:
      return GLOBAL_LIVE_EOI_APPLICANT_STATUS.RECEIVED;
    case GLOBAL_LIVE_EOI_STATUS.UNDER_REVIEW:
      return GLOBAL_LIVE_EOI_APPLICANT_STATUS.REVIEWING;
    case GLOBAL_LIVE_EOI_STATUS.SHORTLISTED:
      return GLOBAL_LIVE_EOI_APPLICANT_STATUS.SHORTLISTED;
    case GLOBAL_LIVE_EOI_STATUS.SELECTED:
      return GLOBAL_LIVE_EOI_APPLICANT_STATUS.SELECTED;
    case GLOBAL_LIVE_EOI_STATUS.WAITLISTED:
      return GLOBAL_LIVE_EOI_APPLICANT_STATUS.WAITLISTED;
    case GLOBAL_LIVE_EOI_STATUS.DECLINED:
      return GLOBAL_LIVE_EOI_APPLICANT_STATUS.CLOSED;
    case GLOBAL_LIVE_EOI_STATUS.WITHDRAWN:
      return GLOBAL_LIVE_EOI_APPLICANT_STATUS.WITHDRAWN;
    default:
      return GLOBAL_LIVE_EOI_APPLICANT_STATUS.RECEIVED;
  }
}

/**
 * @param {string} applicantStatus
 * @param {'vi'|'en'} locale
 */
export function applicantStatusLabel(applicantStatus, locale = 'en') {
  const vi = locale === 'vi';
  switch (applicantStatus) {
    case GLOBAL_LIVE_EOI_APPLICANT_STATUS.RECEIVED:
      return vi ? 'Đã nhận' : 'Received';
    case GLOBAL_LIVE_EOI_APPLICANT_STATUS.REVIEWING:
      return vi ? 'Đang xem xét' : 'Under review';
    case GLOBAL_LIVE_EOI_APPLICANT_STATUS.SHORTLISTED:
      return vi ? 'Đã vào danh sách ngắn' : 'Shortlisted';
    case GLOBAL_LIVE_EOI_APPLICANT_STATUS.SELECTED:
      return vi ? 'Được chọn tham gia thí điểm' : 'Selected for the pilot';
    case GLOBAL_LIVE_EOI_APPLICANT_STATUS.WAITLISTED:
      return vi ? 'Danh sách chờ' : 'Waitlisted';
    case GLOBAL_LIVE_EOI_APPLICANT_STATUS.CLOSED:
      return vi ? 'Không được chọn lần này' : 'Not selected this round';
    case GLOBAL_LIVE_EOI_APPLICANT_STATUS.WITHDRAWN:
      return vi ? 'Đã rút hồ sơ' : 'Withdrawn';
    default:
      return vi ? 'Đã nhận' : 'Received';
  }
}

/**
 * @param {string} applicantStatus
 * @param {'vi'|'en'} locale
 */
export function applicantNextStep(applicantStatus, locale = 'en') {
  const vi = locale === 'vi';
  switch (applicantStatus) {
    case GLOBAL_LIVE_EOI_APPLICANT_STATUS.RECEIVED:
      return vi
        ? 'Cardbey sẽ xem xét hồ sơ và liên hệ nếu doanh nghiệp phù hợp.'
        : 'Cardbey will review your application and contact you if your business is a fit.';
    case GLOBAL_LIVE_EOI_APPLICANT_STATUS.REVIEWING:
      return vi
        ? 'Hồ sơ đang được xem xét. Bạn không cần gửi lại.'
        : 'Your application is being reviewed. You do not need to resubmit.';
    case GLOBAL_LIVE_EOI_APPLICANT_STATUS.SHORTLISTED:
      return vi
        ? 'Cardbey có thể liên hệ để trao đổi bước tiếp theo.'
        : 'Cardbey may contact you to discuss next steps.';
    case GLOBAL_LIVE_EOI_APPLICANT_STATUS.SELECTED:
      return vi
        ? 'Nếu được hướng dẫn, hãy chuẩn bị gian hàng và nội dung phiên Global Live.'
        : 'When guided, prepare your storefront and Global Live session content.';
    case GLOBAL_LIVE_EOI_APPLICANT_STATUS.WAITLISTED:
      return vi
        ? 'Hồ sơ đang ở danh sách chờ. Cardbey sẽ liên hệ nếu có suất.'
        : 'Your application is on the waitlist. Cardbey will contact you if a place opens.';
    case GLOBAL_LIVE_EOI_APPLICANT_STATUS.CLOSED:
      return vi
        ? 'Cảm ơn bạn đã đăng ký. Hãy tiếp tục cập nhật doanh nghiệp trên Cardbey.'
        : 'Thank you for applying. Keep your Cardbey business profile up to date.';
    case GLOBAL_LIVE_EOI_APPLICANT_STATUS.WITHDRAWN:
      return vi
        ? 'Hồ sơ đã được rút. Bạn có thể gửi hồ sơ mới khi chương trình mở.'
        : 'This application was withdrawn. You may apply again when the pilot is open.';
    default:
      return vi
        ? 'Cardbey sẽ xem xét hồ sơ và liên hệ nếu doanh nghiệp phù hợp.'
        : 'Cardbey will review your application and contact you if your business is a fit.';
  }
}

export function pilotDisplayName(pilotId, locale = 'en') {
  const { pilot } = resolvePilot(pilotId);
  if (locale === 'vi') {
    return 'Cardbey Global Live — Việt Nam → Úc';
  }
  if (pilot?.label) {
    return `Cardbey Global Live — ${pilot.label}`;
  }
  return 'Cardbey Global Live — Vietnam → Australia';
}

export function showcaseTypeLabels(types, locale = 'en') {
  const list = Array.isArray(types) ? types : [];
  const vi = locale === 'vi';
  const map = vi
    ? {
        products: 'Sản phẩm',
        services: 'Dịch vụ',
        business_story: 'Câu chuyện doanh nghiệp',
        demonstration: 'Trình diễn trực tiếp',
        promotion_offer: 'Khuyến mãi hoặc ưu đãi',
        other: 'Khác',
      }
    : {
        products: 'Products',
        services: 'Services',
        business_story: 'Business story',
        demonstration: 'Live demonstration',
        promotion_offer: 'Promotion or offer',
        other: 'Other',
      };
  return list.map((t) => map[t] || t).filter(Boolean);
}

/**
 * Public-safe applicant DTO — no admin notes, scores, contact history, or internal cuid.
 * @param {object} row
 * @param {'vi'|'en'} [locale]
 */
export function toApplicantEoiDto(row, locale = 'en') {
  if (!row) return null;
  const status = toApplicantStatus(row.status);
  const loc = locale === 'vi' ? 'vi' : 'en';
  return {
    publicReference: row.publicReference || null,
    pilotId: row.pilotId,
    pilotDisplayName: pilotDisplayName(row.pilotId, loc),
    businessName: row.businessName,
    submittedAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    status,
    statusLabel: applicantStatusLabel(status, loc),
    nextStep: applicantNextStep(status, loc),
    preferredLanguage: row.language || null,
    presentationTypes: showcaseTypeLabels(row.showcaseTypes, loc),
  };
}
