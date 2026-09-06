/**
 * Build Business update patch from enriched candidate fields.
 * Only fills empty Business columns — never nulls or placeholder copy.
 */

import type { BusinessCandidateRecord } from '../types.js';
import { isPlaceholderDescription } from './htmlUtils.js';

export type BusinessEnrichmentSnapshot = {
  phone?: string | null;
  email?: string | null;
  websiteUrl?: string | null;
  address?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  tagline?: string | null;
  description?: string | null;
  heroImageUrl?: string | null;
  avatarImageUrl?: string | null;
  socialLinks?: unknown;
  tradingHours?: unknown;
};

function isUsablePhone(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  if (/listed/i.test(t)) return false;
  return true;
}

function isUsableDescription(value: string): boolean {
  if (!value.trim()) return false;
  if (/is listed as a/i.test(value)) return false;
  if (isPlaceholderDescription(value)) return false;
  return true;
}

function emptyish(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return !value.trim();
  return false;
}

function socialLinksRecord(
  links: BusinessCandidateRecord['socialLinks'],
): Record<string, string> | null {
  if (!Array.isArray(links) || !links.length) return null;
  const out: Record<string, string> = {};
  for (const entry of links) {
    const platform = entry?.platform?.trim();
    const url = entry?.url?.trim();
    if (platform && url) out[platform] = url;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Pure patch builder — used by write-back and unit tests.
 */
export function buildBusinessEnrichmentPatch(
  existing: BusinessEnrichmentSnapshot,
  candidate: Pick<
    BusinessCandidateRecord,
    | 'phone'
    | 'email'
    | 'website'
    | 'address'
    | 'suburb'
    | 'state'
    | 'postcode'
    | 'tagline'
    | 'description'
    | 'heroImageUrl'
    | 'logoUrl'
    | 'socialLinks'
    | 'openingHours'
  >,
): Record<string, unknown> {
  const storePatch: Record<string, unknown> = {};

  const fillScalar = (
    key: keyof BusinessEnrichmentSnapshot,
    value: string | null | undefined,
    ok?: (v: string) => boolean,
  ) => {
    if (value == null) return;
    const t = String(value).trim();
    if (!t) return;
    if (ok && !ok(t)) return;
    if (!emptyish(existing[key])) return;
    storePatch[key] = t;
  };

  fillScalar('phone', candidate.phone, isUsablePhone);
  fillScalar('email', candidate.email);
  fillScalar('websiteUrl', candidate.website);
  fillScalar('address', candidate.address);
  fillScalar('suburb', candidate.suburb);
  fillScalar('state', candidate.state);
  fillScalar('postcode', candidate.postcode);
  fillScalar('tagline', candidate.tagline);
  fillScalar('description', candidate.description, isUsableDescription);
  fillScalar('heroImageUrl', candidate.heroImageUrl);
  fillScalar('avatarImageUrl', candidate.logoUrl);

  const social = socialLinksRecord(candidate.socialLinks);
  if (social && emptyish(existing.socialLinks)) {
    storePatch.socialLinks = social;
  }

  if (candidate.openingHours && emptyish(existing.tradingHours)) {
    const hours = candidate.openingHours;
    storePatch.tradingHours =
      typeof hours === 'string'
        ? { summary: hours.trim() }
        : typeof hours === 'object'
          ? hours
          : { summary: String(hours) };
  }

  return storePatch;
}
