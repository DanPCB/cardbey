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
    status: row.status,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}
