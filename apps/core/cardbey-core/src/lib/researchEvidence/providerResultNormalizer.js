import { getProviderName, getProviderTier } from './evidenceTiers.js';
import { createIdentityMatch, OWNER_VERIFIED_STATUS, SOURCE_KIND } from './providerTypes.js';

function trimString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function inferProviderId(source) {
  const sourceType = String(source?.sourceType ?? '').trim();
  const url = String(source?.sourceUrl ?? source?.raw?.website ?? '').toLowerCase();
  const discoveryVia = String(source?.raw?.discoveryVia ?? '').toLowerCase();

  if (sourceType === 'google_business') return 'google_business_profile';
  if (sourceType === 'official_website') return 'official_website';
  if (sourceType === 'facebook') return 'facebook_business_page';
  if (sourceType === 'instagram') return 'instagram_business_profile';
  if (sourceType === 'manual') return 'uploaded_business_card';
  if (sourceType === 'uploaded_document') {
    const ocr = String(source?.raw?.ocrText ?? '').toLowerCase();
    if (/menu/.test(ocr)) return 'uploaded_menu';
    if (/brochure|catalogue|catalog/.test(ocr)) return 'uploaded_brochure';
    return 'uploaded_image_ocr';
  }
  if (sourceType === 'booking_platform') {
    if (url.includes('bookwell') || discoveryVia.includes('bookwell')) return 'bookwell';
    if (url.includes('fresha')) return 'fresha';
    if (url.includes('mindbody')) return 'mindbody';
    if (url.includes('treatwell')) return 'treatwell';
    if (url.includes('timely')) return 'timely';
    if (url.includes('vagaro')) return 'vagaro';
  }
  if (sourceType === 'directory') {
    if (url.includes('yellowpages')) return 'yellow_pages';
    if (url.includes('whitepages')) return 'white_pages';
    if (url.includes('hipages')) return 'hipages';
    if (url.includes('oneflare')) return 'oneflare';
    if (url.includes('serviceseeking')) return 'serviceseeking';
    if (url.includes('tripadvisor')) return 'tripadvisor';
    if (url.includes('yelp')) return 'yelp';
  }
  return sourceType || 'ai_template';
}

function inferSourceKind(providerId) {
  if (providerId.startsWith('uploaded_')) return SOURCE_KIND.UPLOADED_DOCUMENT;
  if (providerId.startsWith('ai_')) return SOURCE_KIND.AI_GENERATED;
  if (providerId === 'uploaded_business_card') return SOURCE_KIND.MANUAL_INPUT;
  return SOURCE_KIND.INTERNET_RESEARCH;
}

function summarizeValue(value) {
  if (value == null) return 'n/a';
  if (typeof value === 'string') return value.slice(0, 160);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  try {
    return JSON.stringify(value).slice(0, 160);
  } catch {
    return String(value);
  }
}

function collectBusinessFacts(raw = {}) {
  return {
    businessName: trimString(raw.businessName) || trimString(raw.name),
    category: trimString(raw.category),
    description: trimString(raw.description),
    address: trimString(raw.address) || trimString(raw.location),
    phone: trimString(raw.phone),
    email: trimString(raw.email),
    website: trimString(raw.website),
    openingHours: raw.openingHours ?? raw.hours ?? null,
    socialLinks: raw.socialLinks && typeof raw.socialLinks === 'object' ? raw.socialLinks : {},
  };
}

function collectCatalogItems(raw = {}) {
  const offers = Array.isArray(raw.offers) ? raw.offers : [];
  return offers
    .map((offer) => {
      if (!offer || typeof offer !== 'object') return null;
      const name = trimString(offer.name) || trimString(offer.title);
      if (!name) return null;
      return {
        name,
        description: trimString(offer.description),
        price: typeof offer.price === 'number' ? offer.price : null,
        durationMinutes: typeof offer.durationMinutes === 'number' ? offer.durationMinutes : null,
        category: trimString(offer.category),
      };
    })
    .filter(Boolean);
}

/**
 * @param {import('../storeCreationResearch/types.js').SourceMatchResult|undefined} match
 * @returns {import('./providerTypes.js').ResearchProviderResult|null}
 */
export function normalizeLegacyMatchToProviderResult(match) {
  if (!match?.source) return null;
  const providerId = inferProviderId(match.source);
  const tier = getProviderTier(providerId);
  const sourceType = inferSourceKind(providerId);
  const raw = match.source.raw && typeof match.source.raw === 'object' ? match.source.raw : {};
  const businessFacts = collectBusinessFacts(raw);
  const catalogItems = collectCatalogItems(raw);
  const fetchedAt = new Date().toISOString();
  /** @type {import('./providerTypes.js').SourceEvidence[]} */
  const sourceEvidence = [];

  for (const [fieldPath, value] of Object.entries(businessFacts)) {
    if (value == null || value === '') continue;
    sourceEvidence.push({
      id: `${providerId}:${fieldPath}:${sourceEvidence.length}`,
      providerId,
      tier,
      sourceUrl: trimString(match.source.sourceUrl),
      sourceType,
      fieldPath: `businessFacts.${fieldPath}`,
      valueSummary: summarizeValue(value),
      confidence: match.confidence,
      fetchedAt,
      ownerVerifiedStatus: match.confidence >= 0.75
        ? OWNER_VERIFIED_STATUS.ACCEPTED
        : OWNER_VERIFIED_STATUS.PENDING,
    });
  }

  for (const item of catalogItems) {
    sourceEvidence.push({
      id: `${providerId}:catalogItems.${item.name}:${sourceEvidence.length}`,
      providerId,
      tier,
      sourceUrl: trimString(match.source.sourceUrl),
      sourceType,
      fieldPath: 'catalogItems',
      valueSummary: summarizeValue(item),
      confidence: match.confidence,
      fetchedAt,
      ownerVerifiedStatus: match.confidence >= 0.75
        ? OWNER_VERIFIED_STATUS.ACCEPTED
        : OWNER_VERIFIED_STATUS.PENDING,
    });
  }

  return {
    providerId,
    providerName: getProviderName(providerId),
    tier,
    sourceType,
    sourceUrl: trimString(match.source.sourceUrl),
    fetchedAt,
    confidence: match.confidence,
    identityMatch: createIdentityMatch({
      matched: match.matched,
      confidence: match.confidence,
      reasons: match.reasons,
      matchedFields: match.reasons,
    }),
    businessFacts,
    catalogItems,
    mediaAssets: Array.isArray(raw.images)
      ? raw.images.map((url, index) => ({ id: `${providerId}:media:${index}`, url }))
      : [],
    reviews: [],
    policies: {},
    rawEvidenceSummary: `${getProviderName(providerId)} matched at ${Math.round(match.confidence * 100)}% confidence`,
    sourceEvidence,
    errors: [],
  };
}

export function createAiFallbackProviderResult(input = {}) {
  const fetchedAt = new Date().toISOString();
  return {
    providerId: 'ai_template',
    providerName: getProviderName('ai_template'),
    tier: getProviderTier('ai_template'),
    sourceType: SOURCE_KIND.AI_GENERATED,
    sourceUrl: null,
    fetchedAt,
    confidence: 0,
    identityMatch: createIdentityMatch({
      matched: false,
      confidence: 0,
      reasons: ['insufficient_real_world_evidence'],
      matchedFields: [],
    }),
    businessFacts: {
      businessName: trimString(input.businessName),
      address: trimString(input.location),
    },
    catalogItems: [],
    mediaAssets: [],
    reviews: [],
    policies: { ownerReviewRequired: true },
    rawEvidenceSummary: 'AI fallback generated because real evidence was insufficient',
    sourceEvidence: [],
    errors: [],
  };
}
