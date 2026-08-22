/**
 * Server-authoritative Global Live EOI consent evidence.
 * Never trust browser-supplied consentVersion / hash values.
 */

import { createHash } from 'crypto';
import {
  CURRENT_PLATFORM_TERMS_VERSION,
  CURRENT_PRIVACY_POLICY_VERSION,
} from './legalRegistry.js';

export const GLOBAL_LIVE_EOI_CONSENT_VERSION = 'global-live-eoi-consent-v1';
export const GLOBAL_LIVE_EOI_CONSENT_CONTEXT = 'GLOBAL_LIVE_EOI';

/**
 * Canonical plain-text consent shown to applicants (must stay stable for hashing).
 * UI may wrap Terms/Privacy as links; hashed body is this plain form.
 */
export const EOI_CONSENT_TEXT_BY_LOCALE = Object.freeze({
  en: 'I agree that Cardbey may use this information to assess and contact me about the Global Live pilot. I agree to the Terms & Conditions and acknowledge the Privacy Policy.',
  vi: 'Tôi đồng ý để Cardbey sử dụng thông tin này để đánh giá và liên hệ với tôi về thí điểm Global Live. Tôi đồng ý với Điều khoản & Điều kiện và xác nhận Chính sách quyền riêng tư.',
});

/**
 * @param {string | null | undefined} language
 * @returns {'en' | 'vi'}
 */
export function resolveConsentLocale(language) {
  const raw = String(language || '').trim().toLowerCase();
  if (raw.startsWith('vi')) return 'vi';
  return 'en';
}

/**
 * @param {'en' | 'vi'} locale
 */
export function getCanonicalConsentText(locale) {
  return EOI_CONSENT_TEXT_BY_LOCALE[locale] || EOI_CONSENT_TEXT_BY_LOCALE.en;
}

/**
 * @param {string} text
 */
export function hashConsentText(text) {
  return createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

/**
 * Build persistence payload for a new EOI (ignore any client version fields).
 * @param {{ language?: string | null }} input
 */
export function buildServerConsentEvidence(input = {}) {
  const consentLocale = resolveConsentLocale(input.language);
  const consentText = getCanonicalConsentText(consentLocale);
  return {
    consentVersion: GLOBAL_LIVE_EOI_CONSENT_VERSION,
    privacyVersion: CURRENT_PRIVACY_POLICY_VERSION,
    termsVersion: CURRENT_PLATFORM_TERMS_VERSION,
    consentLocale,
    consentContext: GLOBAL_LIVE_EOI_CONSENT_CONTEXT,
    consentTextHash: hashConsentText(consentText),
  };
}

/**
 * Admin-facing consent evidence summary (legacy-safe).
 * @param {Record<string, unknown> | null | undefined} row
 */
export function toConsentEvidenceDto(row) {
  if (!row) return null;
  const versioned = Boolean(row.consentVersion && row.consentTextHash);
  return {
    versioned,
    label: versioned ? 'versioned' : 'legacy_unversioned',
    consentVersion: row.consentVersion ?? null,
    privacyVersion: row.privacyVersion ?? null,
    termsVersion: row.termsVersion ?? null,
    consentLocale: row.consentLocale ?? null,
    consentContext: row.consentContext ?? null,
    consentTextHash: row.consentTextHash ?? null,
    consentGranted: Boolean(row.consentGranted),
    consentAt: row.consentAt ? new Date(row.consentAt).toISOString() : null,
  };
}
