import { cleanString, normalizeWebsite, websiteHost } from '../businessDiscovery/businessDataNormalizer.runtime.js';
import type { ExternalMarketSignal, MarketIntentAnalysis } from './types.js';
import type { ResolutionHints } from './entityTypes.js';

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
 * Extract permitted resolution hints from G1 output only — no invented identity.
 */
export function extractResolutionHints(
  signal: ExternalMarketSignal,
  analysis: MarketIntentAnalysis,
): ResolutionHints {
  const businessName =
    cleanString(analysis.businessHint) ??
    cleanString(analysis.actorHint) ??
    cleanString(firstHasLabel(analysis, ['BUSINESS', 'PRODUCT', 'SERVICE'])) ??
    null;

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
    location,
    websiteHint,
    phoneHint:
      typeof signal.metadata?.phone === 'string' ? cleanString(signal.metadata.phone) : null,
    category,
    socialProfileUrl,
  };
}

export function extractWebsiteFromHints(hints: ResolutionHints): string | null {
  return hints.websiteHint ?? null;
}

export { isSocialHost };
