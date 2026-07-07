/**
 * Identity matching + confidence scoring for discovered sources.
 */

import { matchCandidates } from '../businessDiscovery/businessEntityResolver.js';
import { cleanString, normalizePhone, normalizeWebsite, websiteHost } from '../businessDiscovery/businessDataNormalizer.js';
import { venueSlugMatchesName } from './bookwellVenueDiscovery.js';

/**
 * @param {string|null|undefined} url
 */
function extractBookwellVenueSlug(url) {
  const match = String(url ?? '').match(/\/venue\/([a-z0-9-]+)\//i);
  return match?.[1] ?? null;
}

/**
 * @param {import('./types.js').DiscoveredSource} source
 * @param {import('./types.js').StoreCreationResearchInput} identity
 * @returns {import('./types.js').SourceMatchResult}
 */
export function scoreSourceMatch(source, identity) {
  const raw = source.raw ?? {};
  const candidate = {
    name: cleanString(raw.name) ?? cleanString(raw.businessName),
    phone: normalizePhone(raw.phone ?? raw.telephone),
    website: normalizeWebsite(raw.website ?? raw.url ?? source.sourceUrl),
    location: cleanString(raw.address ?? raw.location ?? raw.formatted_address),
  };

  const expected = {
    name: cleanString(identity.businessName),
    phone: normalizePhone(identity.phone),
    website: normalizeWebsite(identity.website),
    location: cleanString(identity.location),
  };

  const reasons = [];
  let confidence = 0;

  if (!expected.name) {
    return { matched: false, confidence: 0, reasons: ['missing-expected-name'], source };
  }

  const signal = matchCandidates(expected, candidate);
  confidence = signal.score;
  reasons.push(...signal.reasons);

  const socialHandle = extractSocialHandle(identity.socialLinks);
  const sourceUrl = String(source.sourceUrl ?? raw.website ?? '').toLowerCase();
  if (socialHandle && sourceUrl.includes(socialHandle)) {
    reasons.push('social-handle');
    confidence = Math.min(1, confidence + 0.25);
  }

  if (expected.website && candidate.website) {
    const hostA = websiteHost(expected.website);
    const hostB = websiteHost(candidate.website);
    if (hostA && hostB && hostA === hostB) {
      reasons.push('domain-exact');
      confidence = Math.min(1, Math.max(confidence, 0.75));
    }
  }

  if (source.sourceType === 'uploaded_document' && expected.name) {
    const docName = cleanString(raw.name ?? raw.businessName);
    if (docName && slugSimilarity(expected.name, docName) > 0.8) {
      reasons.push('document-name');
      confidence = Math.min(1, Math.max(confidence, 0.7));
    }
  }

  if (source.sourceType === 'official_website' || source.sourceType === 'google_business') {
    confidence = Math.min(1, confidence + 0.1);
  }

  const placeId = raw.placeId ?? raw.sourceId;
  const placeName = cleanString(raw.name ?? raw.businessName);
  if (source.sourceType === 'google_business' && placeId && placeName && expected.name) {
    const nameSimilarity = slugSimilarity(expected.name, placeName);
    if (nameSimilarity >= 0.8) {
      reasons.push('google-place-name');
      const ratingBoost = raw.rating != null ? 0.94 : 0.88;
      confidence = Math.min(1, Math.max(confidence, ratingBoost));
    }
  }

  const venueSlug = extractBookwellVenueSlug(source.sourceUrl ?? raw.website);
  const bookwellOffers = Array.isArray(raw.offers) ? raw.offers : [];
  const bookwellDiscovery =
    raw.discoveryVia === 'bookwell_listing' ||
    (source.sourceType === 'booking_platform' && /bookwell\.com/i.test(sourceUrl));
  if (
    bookwellDiscovery &&
    venueSlug &&
    venueSlugMatchesName(expected.name, venueSlug) &&
    bookwellOffers.length > 0
  ) {
    reasons.push('bookwell-venue-menu');
    confidence = Math.min(1, Math.max(confidence, 0.9));
  } else if (venueSlug && venueSlugMatchesName(expected.name, venueSlug)) {
    reasons.push('bookwell-venue-slug');
    confidence = Math.min(1, Math.max(confidence, 0.82));
  }

  const matched =
    signal.matched ||
    confidence >= 0.55 ||
    reasons.includes('bookwell-venue-menu') ||
    reasons.includes('bookwell-venue-slug') ||
    reasons.includes('google-place-name');
  return { matched, confidence, reasons, source };
}

function slugSimilarity(a, b) {
  const sa = slugWords(a);
  const sb = slugWords(b);
  if (!sa || !sb) return 0;
  if (sa === sb) return 1;
  return sa.includes(sb) || sb.includes(sa) ? 0.85 : 0;
}

function slugWords(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
}

function extractSocialHandle(socialLinks) {
  if (!socialLinks || typeof socialLinks !== 'object') return null;
  for (const url of Object.values(socialLinks)) {
    const m = String(url ?? '').match(/(?:instagram|facebook)\.com\/([^/?#]+)/i);
    if (m?.[1]) return m[1].toLowerCase();
  }
  return null;
}

/**
 * @param {import('./types.js').SourceMatchResult[]} matches
 */
export function aggregateResearchConfidence(matches) {
  const usable = matches.filter((m) => m.matched && m.confidence >= 0.25);
  if (!usable.length) return 0;
  return usable.reduce((sum, m) => sum + m.confidence, 0) / usable.length;
}
