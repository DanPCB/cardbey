/**
 * Country-specific phone and address normalisation.
 * Does not force Vietnamese addresses into Australian structures.
 */

import type { MarketCountryCode } from '../marketRegistry/types.js';
import { stripDiacritics } from '../marketRegistry/index.js';

export function normalizePhoneForCountry(
  phone: string | null | undefined,
  countryCode: MarketCountryCode,
): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return '';

  if (countryCode === 'AU') {
    // +61 / 0 leading
    if (digits.startsWith('61') && digits.length >= 11) return digits.slice(0, 11);
    if (digits.startsWith('0') && digits.length === 10) return `61${digits.slice(1)}`;
    if (digits.length === 9) return `61${digits}`;
    return digits;
  }

  // VN: +84 / 0 leading; keep national significant number with 84 prefix
  if (digits.startsWith('84') && digits.length >= 10) return digits.slice(0, 11);
  if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 11) {
    return `84${digits.slice(1)}`;
  }
  return digits;
}

export interface NormalizedAddressParts {
  countryCode: MarketCountryCode;
  line1: string | null;
  locality: string | null;
  region: string | null;
  postcode: string | null;
  /** Full display line preserving original script */
  display: string | null;
  /** Match key without diacritics for VN */
  matchKey: string;
}

export function normalizeAddressForCountry(params: {
  countryCode: MarketCountryCode;
  address?: string | null;
  locality?: string | null;
  region?: string | null;
  postcode?: string | null;
}): NormalizedAddressParts {
  const display =
    [params.address, params.locality, params.region, params.postcode]
      .map((p) => (p ?? '').trim())
      .filter(Boolean)
      .join(', ') || null;

  if (params.countryCode === 'AU') {
    const postcode = (params.postcode ?? '').replace(/\D/g, '').slice(0, 4) || null;
    const region = (params.region ?? '').trim().toUpperCase() || null;
    const locality = (params.locality ?? '').trim() || null;
    const line1 = (params.address ?? '').trim() || null;
    const matchKey = [line1, locality, region, postcode]
      .map((p) => (p ?? '').toLowerCase().replace(/\s+/g, ' '))
      .filter(Boolean)
      .join('|');
    return { countryCode: 'AU', line1, locality, region, postcode, display, matchKey };
  }

  // Vietnam: preserve original text; match key strips diacritics only
  const line1 = (params.address ?? '').trim() || null;
  const locality = (params.locality ?? '').trim() || null;
  const region = (params.region ?? '').trim() || null;
  const postcode = (params.postcode ?? '').trim() || null;
  const matchKey = stripDiacritics(
    [line1, locality, region, postcode].filter(Boolean).join('|'),
  )
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return { countryCode: 'VN', line1, locality, region, postcode, display, matchKey };
}

export function normalizeBusinessNameForMatch(
  name: string | null | undefined,
  countryCode: MarketCountryCode,
): string {
  const raw = (name ?? '').trim();
  if (!raw) return '';
  if (countryCode === 'VN') return stripDiacritics(raw).toLowerCase().replace(/\s+/g, ' ');
  return raw.toLowerCase().replace(/\s+/g, ' ');
}
