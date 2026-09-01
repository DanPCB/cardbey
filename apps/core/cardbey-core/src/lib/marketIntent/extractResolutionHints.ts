import {
  cleanString,
  normalizePhone,
  normalizeWebsite,
  websiteHost,
} from '../businessDiscovery/businessDataNormalizer.runtime.js';
import type { ExternalMarketSignal, MarketIntentAnalysis } from './types.js';
import type { ResolutionHints, IdentityHintProvenance } from './entityTypes.js';
import { isPersonalActorName } from './candidateEntityCoherence.js';

const SOCIAL_HOSTS = new Set([
  'facebook.com',
  'fb.com',
  'instagram.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'youtube.com',
]);

function isSocialHost(url: string | null | undefined): boolean {
  const host = websiteHost(url ?? '');
  if (!host) return false;
  return [...SOCIAL_HOSTS].some((s) => host === s || host.endsWith(`.${s}`));
}

function firstHasLabel(
  analysis: MarketIntentAnalysis,
  types: string[],
): string | null {
  for (const item of analysis.has) {
    if (types.includes(item.type) && item.label?.trim()) {
      return item.label.trim();
    }
  }
  return null;
}

/**
 * True when text looks like a trade/business name, not a service offering description.
 * Conservative — rejects generic service copy without a giant keyword list.
 */
export function isIdentityLikeBusinessName(value: string | null | undefined): boolean {
  const t = cleanString(value);
  if (!t || t.length < 2 || t.length > 80) return false;

  const lower = t.toLowerCase();

  if (/^công ty\/đơn vị\b/i.test(t)) return false;
  if (/^(our |the )?(company|business|employer)\b/i.test(lower)) return false;

  const serviceIndicators = [
    /dịch vụ/i,
    /\bservices?\b/i,
    /\binstallation\b.*\b(repair|upgrade)\b/i,
    /\b(repair|upgrade)\b.*\binstallation\b/i,
    /\bprofessional\s+\w+\s+services?\b/i,
    /\bcommercial\s+\w+\s+services?\b/i,
    /\bsupply,?\s+installation\b/i,
    /\band\s+(repair|upgrade|install)/i,
    /\bprovider\b$/i,
    /\bcapability\b/i,
    /\bend-to-end\b/i,
    /\bmeasur(e|ing)\b.*\b(quote|install)/i,
  ];
  if (serviceIndicators.some((re) => re.test(t))) return false;

  if (t.split(/\s+/).length > 7) return false;

  return true;
}

/**
 * Extract a clearly formatted phone from permitted signal text (no enrichment).
 */
export function extractPhoneFromSignalText(rawText: string): string | null {
  const text = String(rawText ?? '');
  if (!text.trim()) return null;

  const labeled = text.match(
    /(?:phone|tel|mobile|call|hotline|☎|📞)[:\s]*([+\d][\d\s().-]{7,18}\d)/i,
  );
  if (labeled?.[1]) {
    const normalized = normalizePhone(labeled[1]);
    if (normalized && normalized.replace(/\D/g, '').length >= 8) return normalized;
  }

  const auMobile = text.match(/\b(0[45]\d{8})\b/);
  if (auMobile?.[1]) return normalizePhone(auMobile[1]);

  const intl = text.match(/\+\d{10,15}/);
  if (intl?.[0]) return normalizePhone(intl[0]);

  return null;
}

function resolveBusinessName(
  signal: ExternalMarketSignal,
  analysis: MarketIntentAnalysis,
): { businessName: string | null; provenance: IdentityHintProvenance | null } {
  // Explicit G1 BUSINESS identity outranks personal actor/profile names (e.g. Hà My vs Mèo Ú).
  for (const item of analysis.has) {
    if (item.type === 'BUSINESS' && item.basis === 'EXPLICIT' && item.label?.trim()) {
      const explicitBusiness = cleanString(item.label);
      if (explicitBusiness && isIdentityLikeBusinessName(explicitBusiness)) {
        return { businessName: explicitBusiness, provenance: 'BUSINESS_EXPLICIT' };
      }
    }
  }

  const metaName =
    typeof signal.metadata?.businessName === 'string'
      ? cleanString(signal.metadata.businessName)
      : null;
  if (metaName && isIdentityLikeBusinessName(metaName)) {
    return { businessName: metaName, provenance: 'BUSINESS_EXPLICIT' };
  }

  const actor = cleanString(analysis.actorHint);
  const actorIsPersonal = actor ? isPersonalActorName(actor) : false;
  if (actor && !actorIsPersonal && isIdentityLikeBusinessName(actor)) {
    return { businessName: actor, provenance: 'BUSINESS_INFERRED' };
  }

  const businessHint = cleanString(analysis.businessHint);
  if (businessHint && isIdentityLikeBusinessName(businessHint)) {
    return { businessName: businessHint, provenance: 'BUSINESS_INFERRED' };
  }

  const hasBusiness = cleanString(firstHasLabel(analysis, ['BUSINESS']));
  if (hasBusiness && isIdentityLikeBusinessName(hasBusiness)) {
    return { businessName: hasBusiness, provenance: 'BUSINESS_INFERRED' };
  }

  return { businessName: null, provenance: null };
}

function resolvePhoneHint(signal: ExternalMarketSignal): string | null {
  if (typeof signal.metadata?.phone === 'string') {
    const fromMeta = normalizePhone(cleanString(signal.metadata.phone) ?? '');
    if (fromMeta) return fromMeta;
  }
  return extractPhoneFromSignalText(signal.rawText);
}

/**
 * Extract permitted resolution hints from G1 output only — no invented identity.
 */
export function extractResolutionHints(
  signal: ExternalMarketSignal,
  analysis: MarketIntentAnalysis,
): ResolutionHints {
  const actor = cleanString(analysis.actorHint);
  const actorIsPersonal = actor ? isPersonalActorName(actor) : false;
  const { businessName, provenance } = resolveBusinessName(signal, analysis);

  const location =
    cleanString(analysis.locationHint) ??
    cleanString(firstHasLabel(analysis, ['LOCATION'])) ??
    null;

  let websiteHint: string | null = null;
  const sourceUrl = cleanString(signal.sourceUrl);
  if (sourceUrl && !isSocialHost(sourceUrl)) {
    websiteHint = normalizeWebsite(sourceUrl);
  }

  const metaWebsite =
    typeof signal.metadata?.website === 'string' ? cleanString(signal.metadata.website) : null;
  if (metaWebsite && !isSocialHost(metaWebsite)) {
    websiteHint = normalizeWebsite(metaWebsite) ?? websiteHint;
  }

  let socialProfileUrl: string | null = null;
  if (sourceUrl && isSocialHost(sourceUrl)) {
    socialProfileUrl = sourceUrl;
  }

  const category = firstHasLabel(analysis, ['PRODUCT', 'SERVICE', 'CAPABILITY']);

  return {
    businessName,
    actorHint: actor,
    actorHintKind: actor ? (actorIsPersonal ? 'PERSON' : 'BUSINESS') : null,
    businessNameProvenance: provenance,
    location,
    websiteHint,
    phoneHint: resolvePhoneHint(signal),
    category,
    socialProfileUrl,
  };
}

export function extractWebsiteFromHints(hints: ResolutionHints): string | null {
  return hints.websiteHint ?? null;
}

export { isSocialHost, isPersonalActorName };
