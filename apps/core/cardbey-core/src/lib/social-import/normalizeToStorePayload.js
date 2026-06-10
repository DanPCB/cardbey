/**
 * normalizeToStorePayload
 *
 * Maps a raw adapter payload (SocialImportRaw) onto the intake shape consumed by
 * the existing store mission pipeline (createMissionPipeline metadata +
 * structured_store_build). It does NOT create or publish anything — it only
 * shapes data.
 *
 * @typedef {Object} SocialImportRaw
 * @property {string} platform
 * @property {string} sourceUrl
 * @property {string} businessName
 * @property {string} [description]
 * @property {string} [category]
 * @property {string} [location]
 * @property {string} [hours]
 * @property {{ phone?: string, email?: string, website?: string }} [contact]
 * @property {string} [profilePhoto]
 * @property {string} [coverPhoto]
 * @property {string[]} [photos]
 * @property {Array<object>} [posts]
 * @property {Array<{ name: string, price?: number, category?: string }>} [products]
 * @property {Record<string, string>} [socialLinks]
 * @property {string} [priceRange]
 *
 * @typedef {Object} SocialImportStorePayload
 * @property {string} businessName
 * @property {string} businessType
 * @property {string} location
 * @property {string} brandTone
 * @property {string} brandStyle
 * @property {string} logoUrl
 * @property {{ url: string, type: 'image'|'video' } | null} heroMedia
 * @property {Record<string, string> | null} socialLinks
 * @property {Array<{ name: string, price: number, category: string, source: string }>} products
 * @property {string} currencyCode
 * @property {string} rawUserText
 * @property {string} sourceUrl
 * @property {string} platform
 * @property {'social_import'} source
 */

import { inferCurrencyFromLocationText } from '../../services/draftStore/currencyInfer.js';
import { buildMapUrl, parseAddress } from '../../services/draftStore/storeContactIntake.js';
import { normalizeSocialLinks, SOCIAL_LINK_KEYS } from '../socialLinks.js';
import { sanitizePreloadedCatalogItems } from '../../services/draftStore/preloadedCatalogFromItems.js';

/**
 * Keyword → Cardbey store type (vertical) mapping. Falls back to 'general'.
 * Keys are matched (case-insensitive substring) against the scraped category.
 */
const CATEGORY_TO_STORE_TYPE = [
  [/restaurant|food|dining|eatery|bistro|diner|takeaway|take-?out/i, 'restaurant'],
  [/cafe|coffee|bakery|patisserie|dessert|tea/i, 'cafe'],
  [/bar|pub|brewery|winery|cocktail/i, 'restaurant'],
  [/salon|barber|hair|nail|spa|beauty|massage|wellness/i, 'salon'],
  [/gym|fitness|yoga|pilates|crossfit|studio/i, 'fitness'],
  [/clinic|dental|dentist|medical|health|pharmacy|physio|chiropract/i, 'health'],
  [/grocery|market|supermarket|convenience|deli/i, 'grocery'],
  [/clothing|fashion|apparel|boutique|shoe|jewel|accessor/i, 'fashion'],
  [/store|shop|retail|merchant/i, 'retail'],
  [/service|repair|plumb|electric|clean|consult|agency|law|account/i, 'services'],
];

/**
 * @param {SocialImportRaw} raw
 * @returns {SocialImportStorePayload}
 */
export function normalizeToStorePayload(raw) {
  const safe = raw && typeof raw === 'object' ? raw : {};
  const businessName = str(safe.businessName);
  const location = str(safe.location);
  const category = str(safe.category);
  const description = str(safe.description);

  const businessType = mapCategoryToStoreType(category, description);
  const currencyCode = inferCurrencyFromLocationText(location) || 'AUD';

  const brandFromRaw =
    safe.brandSignals && typeof safe.brandSignals === 'object'
      ? {
          brandTone: str(safe.brandSignals.tone) || null,
          brandStyle: str(safe.brandSignals.style) || null,
        }
      : null;
  const inferredBrand = inferBrand(description, businessType);
  const brandTone = brandFromRaw?.brandTone || inferredBrand.brandTone;
  const brandStyle = brandFromRaw?.brandStyle || inferredBrand.brandStyle;

  const logoUrl = firstHttpUrl([safe.profilePhoto]);
  const heroUrl = firstHttpUrl([safe.coverPhoto, ...(Array.isArray(safe.photos) ? safe.photos : [])]);
  const heroMedia = heroUrl ? { url: heroUrl, type: 'image' } : null;

  const socialLinks = buildSocialLinks(safe);
  const products = sanitizePreloadedCatalogItems(
    Array.isArray(safe.products)
      ? safe.products.map((p) => ({
          name: str(p?.name),
          description: str(p?.description) || null,
          price: typeof p?.price === 'number' ? p.price : Number(p?.price) || 0,
          imageUrl: str(p?.imageUrl) || null,
          category: str(p?.category) || 'Menu',
          source: 'social_import',
          ...(str(p?.imageUrl) ? { imageSource: 'imported' } : {}),
        }))
      : null,
  ) || [];

  const rawUserText = buildRawUserText(businessName, businessType, location, safe.sourceUrl);

  const phone = str(safe.phone) || str(safe.contact?.phone) || null;
  const email = str(safe.email) || str(safe.contact?.email) || null;
  const address = str(safe.address) || str(safe.location) || null;
  const addressParts = parseAddress(address);
  const hoursValue = safe.hours ?? null;
  const hours =
    hoursValue == null || hoursValue === ''
      ? null
      : typeof hoursValue === 'string'
        ? hoursValue
        : JSON.stringify(hoursValue);
  const priceRange = str(safe.priceRange) || null;

  return {
    businessName,
    businessType,
    location: location || address,
    brandTone,
    brandStyle,
    logoUrl,
    heroMedia,
    socialLinks,
    products,
    productSource: safe.productSource ?? null,
    currencyCode,
    rawUserText,
    sourceUrl: str(safe.sourceUrl),
    platform: str(safe.platform),
    source: 'social_import',
    phone,
    email,
    websiteUrl: str(safe.websiteUrl) || str(safe.sourceUrl) || null,
    address,
    suburb: addressParts.suburb,
    state: addressParts.state,
    postcode: addressParts.postcode,
    country: addressParts.country,
    mapUrl: buildMapUrl(address),
    ...(hours ? { hours } : {}),
    ...(priceRange ? { priceRange } : {}),
  };
}

function str(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function mapCategoryToStoreType(category, description) {
  const haystack = `${category} ${description}`.toLowerCase();
  if (!haystack.trim()) return 'general';
  for (const [re, type] of CATEGORY_TO_STORE_TYPE) {
    if (re.test(haystack)) return type;
  }
  return 'general';
}

function inferBrand(description, businessType) {
  const text = description.toLowerCase();
  let brandTone = 'friendly';
  if (/luxur|premium|exclusive|bespoke|fine/i.test(text)) brandTone = 'luxury';
  else if (/minimal|simple|clean/i.test(text)) brandTone = 'minimal';
  else if (/bold|vibrant|fun|playful/i.test(text)) brandTone = 'bold';

  let brandStyle = 'modern';
  if (/vintage|retro|classic|heritage|traditional/i.test(text)) brandStyle = 'vintage';
  else if (businessType === 'cafe' || businessType === 'restaurant') brandStyle = 'warm';

  return { brandTone, brandStyle };
}

function firstHttpUrl(candidates) {
  for (const c of candidates) {
    if (typeof c === 'string' && /^https?:\/\//i.test(c.trim())) return c.trim();
  }
  return '';
}

/**
 * Build a validated socialLinks object that always back-links to the source page
 * for the originating platform.
 */
function buildSocialLinks(raw) {
  const collected = {};
  const incoming = raw.socialLinks && typeof raw.socialLinks === 'object' ? raw.socialLinks : {};
  for (const key of SOCIAL_LINK_KEYS) {
    if (typeof incoming[key] === 'string' && incoming[key].trim()) {
      collected[key] = incoming[key].trim();
    }
  }

  if (str(raw.platform) === 'website') {
    const websiteUrl = typeof raw.sourceUrl === 'string' ? raw.sourceUrl.trim() : '';
    const merged = { ...(websiteUrl ? { website: websiteUrl } : {}), ...collected };
    for (const [key, value] of Object.entries(incoming)) {
      if (typeof value === 'string' && value.trim() && !merged[key]) {
        merged[key] = value.trim();
      }
    }
    const normalized = normalizeSocialLinks(merged);
    const base = normalized.ok && normalized.value ? { ...normalized.value } : {};
    if (merged.website) base.website = merged.website;
    return Object.keys(base).length ? base : null;
  }

  const backlinkKey = platformToSocialKey(raw.platform);
  if (backlinkKey && !collected[backlinkKey] && typeof raw.sourceUrl === 'string' && raw.sourceUrl.trim()) {
    collected[backlinkKey] = raw.sourceUrl.trim();
  }
  const normalized = normalizeSocialLinks(collected);
  return normalized.ok ? normalized.value : null;
}

function platformToSocialKey(platform) {
  switch (str(platform)) {
    case 'facebook':
      return 'facebook';
    case 'instagram':
      return 'instagram';
    case 'tiktok':
      return 'tiktok';
    default:
      return null;
  }
}

function buildRawUserText(businessName, businessType, location, sourceUrl) {
  const name = businessName || 'my business';
  const typePart = businessType && businessType !== 'general' ? ` (${businessType})` : '';
  const locPart = location ? ` in ${location}` : '';
  const srcPart = sourceUrl ? ` Imported from ${sourceUrl}.` : '';
  return `Create a store for ${name}${typePart}${locPart}.${srcPart}`.trim();
}
