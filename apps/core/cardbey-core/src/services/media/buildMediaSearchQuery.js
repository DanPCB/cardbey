/**
 * Pure media search query enrichment from user intent + store context.
 */

const MAX_QUERY_LENGTH = 80;
const LUXURY_TONES = new Set(['luxury', 'premium', 'elegant']);
const LOCATION_NOUNS =
  /\b(interior|exterior|storefront|inside|outside|room|kitchen|dining|counter|facade|shop\s+floor|store\s+front)\b/i;
/**
 * @param {string} s
 */
function normalizeWhitespace(s) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} haystack
 * @param {string} phrase
 */
function intentContainsPhrase(haystack, phrase) {
  const h = normalizeWhitespace(haystack).toLowerCase();
  const p = normalizeWhitespace(phrase).toLowerCase();
  return Boolean(p && h.includes(p));
}

/**
 * @param {string} q
 * @param {number} [max]
 */
function truncateQuery(q, max = MAX_QUERY_LENGTH) {
  const s = normalizeWhitespace(q);
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return normalizeWhitespace(lastSpace > 40 ? cut.slice(0, lastSpace) : cut);
}

/**
 * @param {string} website
 */
function normalizeDomain(website) {
  let w = normalizeWhitespace(website).toLowerCase();
  w = w.replace(/^https?:\/\//, '').replace(/^www\./, '');
  w = w.split('/')[0].split('?')[0];
  return w;
}

/**
 * @param {string} s
 */
function hasTld(s) {
  return /\.[a-z]{2,}$/i.test(String(s ?? '').trim());
}

/**
 * @param {string} domain
 */
function domainStem(domain) {
  const d = normalizeDomain(domain);
  const parts = d.split('.').filter(Boolean);
  if (parts.length >= 2) return parts[0];
  return d;
}

/**
 * @param {string} intent
 */
function extractBrandFromIntent(intent) {
  const s = normalizeWhitespace(intent);
  if (!s) return null;
  const findMatch = s.match(/\b(?:find|get|search(?:\s+for)?)\s+([a-z0-9][\w.-]*)\s+logo\b/i);
  if (findMatch?.[1]) return findMatch[1].toLowerCase();
  const logoMatch = s.match(/\b([a-z0-9][\w.-]*)\s+logo\b/i);
  if (logoMatch?.[1] && !/^(a|the|my|our|your)$/i.test(logoMatch[1])) return logoMatch[1].toLowerCase();
  return null;
}

/**
 * @param {string} intent
 * @param {string} website
 */
function intentNamesDifferentBrand(intent, website) {
  const brand = extractBrandFromIntent(intent);
  if (!brand) return false;
  const site = normalizeDomain(website);
  if (!site) return true;
  const stem = domainStem(site);
  if (brand === stem || brand === site.replace(/\./g, '')) return false;
  if (site.includes(brand) && brand.length >= 3) return false;
  return true;
}

/**
 * @param {string} brand
 */
function brandToDomain(brand) {
  const b = normalizeWhitespace(brand).toLowerCase();
  if (!b) return '';
  if (hasTld(b)) return normalizeDomain(b);
  return `${b.replace(/\s+/g, '')}.com`;
}

/**
 * @param {string} intent
 */
function isGenericPhotoIntent(intent) {
  return !LOCATION_NOUNS.test(normalizeWhitespace(intent));
}

/**
 * @param {string} industry
 */
function photoLocationSuffix(industry) {
  const ind = normalizeWhitespace(industry).toLowerCase();
  if (/(cafe|coffee|restaurant|food|bakery|bistro|diner|kitchen)/.test(ind)) return 'interior';
  return 'storefront';
}

/**
 * @param {import('./storeContextResolver.js').StoreContextShape} storeContext
 */
function buildVideoQuery(userIntent, storeContext) {
  const parts = [normalizeWhitespace(userIntent)].filter(Boolean);
  const industry = normalizeWhitespace(storeContext?.industry);
  const tone = normalizeWhitespace(storeContext?.brandKit?.tone);
  const colors = Array.isArray(storeContext?.brandKit?.colors)
    ? storeContext.brandKit.colors.map((c) => normalizeWhitespace(c)).filter(Boolean).slice(0, 2)
    : [];

  if (industry && !intentContainsPhrase(parts.join(' '), industry)) {
    parts.push(industry);
  }
  if (tone && !intentContainsPhrase(parts.join(' '), tone)) {
    parts.push(tone);
  }
  for (const color of colors) {
    if (!intentContainsPhrase(parts.join(' '), color)) parts.push(color);
  }
  if (tone && LUXURY_TONES.has(tone.toLowerCase()) && !intentContainsPhrase(parts.join(' '), 'aesthetic')) {
    parts.push('aesthetic');
  }

  return truncateQuery(parts.join(' '));
}

const BARE_PHOTO_INTENT = /^(store\s+)?(photo|picture|image)s?$/i;

/**
 * @param {import('./storeContextResolver.js').StoreContextShape} storeContext
 */
function buildPhotoQuery(userIntent, storeContext) {
  const intent = normalizeWhitespace(userIntent);
  const industry = normalizeWhitespace(storeContext?.industry);
  const tone = normalizeWhitespace(storeContext?.brandKit?.tone);
  const colors = Array.isArray(storeContext?.brandKit?.colors)
    ? storeContext.brandKit.colors.map((c) => normalizeWhitespace(c)).filter(Boolean).slice(0, 2)
    : [];

  if (BARE_PHOTO_INTENT.test(intent.toLowerCase())) {
    const parts = [];
    if (industry) parts.push(industry);
    parts.push(photoLocationSuffix(industry));
    if (tone) parts.push(tone);
    for (const color of colors) parts.push(color);
    return truncateQuery(parts.join(' '));
  }

  let q = buildVideoQuery(userIntent, storeContext);
  if (isGenericPhotoIntent(userIntent)) {
    const suffix = photoLocationSuffix(industry);
    if (!intentContainsPhrase(q, suffix)) {
      q = normalizeWhitespace(`${q} ${suffix}`);
    }
  }
  return truncateQuery(q);
}

/**
 * @param {import('./storeContextResolver.js').StoreContextShape} storeContext
 */
function buildBackgroundQuery(userIntent, storeContext) {
  const parts = [normalizeWhitespace(userIntent)].filter(Boolean);
  const industry = normalizeWhitespace(storeContext?.industry);
  const tone = normalizeWhitespace(storeContext?.brandKit?.tone);
  const primaryColor = Array.isArray(storeContext?.brandKit?.colors)
    ? normalizeWhitespace(storeContext.brandKit.colors[0])
    : '';

  if (industry && !intentContainsPhrase(parts.join(' '), industry)) parts.push(industry);
  if (tone && !intentContainsPhrase(parts.join(' '), tone)) parts.push(tone);
  if (primaryColor && !intentContainsPhrase(parts.join(' '), primaryColor)) parts.push(primaryColor);
  const joined = parts.join(' ');
  if (!/\btexture\b/i.test(joined)) parts.push('texture');
  if (!/\bpattern\b/i.test(joined)) parts.push('pattern');
  if (!/\bbackground\b/i.test(joined)) parts.push('background');

  return truncateQuery(parts.join(' '));
}

/**
 * @param {import('./storeContextResolver.js').StoreContextShape} storeContext
 */
function buildLogoQuery(userIntent, storeContext) {
  const intent = normalizeWhitespace(userIntent);
  const website = normalizeDomain(storeContext?.website);
  const storeName = normalizeWhitespace(storeContext?.name);
  const industry = normalizeWhitespace(storeContext?.industry);

  const namedBrand = extractBrandFromIntent(intent);
  if (namedBrand) {
    return brandToDomain(namedBrand);
  }

  if (website && !intentNamesDifferentBrand(intent, website)) {
    return website;
  }

  const fallbackParts = [];
  if (storeName) fallbackParts.push(storeName.toLowerCase());
  if (industry && !intentContainsPhrase(storeName, industry)) {
    fallbackParts.push(industry.toLowerCase());
  }
  if (fallbackParts.length) return normalizeWhitespace(fallbackParts.join(' '));
  return intent || website || '';
}

/**
 * @param {{
 *   userIntent?: string;
 *   mediaType?: string;
 *   storeContext?: import('./storeContextResolver.js').StoreContextShape | null;
 * }} params
 * @returns {string}
 */
export function buildMediaSearchQuery(params = {}) {
  const userIntent = normalizeWhitespace(params.userIntent);
  const mediaType = normalizeWhitespace(params.mediaType).toLowerCase() || 'photo';
  const storeContext = params.storeContext;

  if (!storeContext || typeof storeContext !== 'object') {
    return userIntent;
  }

  const industry = normalizeWhitespace(storeContext.industry);
  const hasContext =
    Boolean(industry) ||
    Boolean(normalizeWhitespace(storeContext.website)) ||
    Boolean(normalizeWhitespace(storeContext.name)) ||
    Boolean(storeContext.brandKit && typeof storeContext.brandKit === 'object');

  if (!hasContext && !userIntent) {
    return '';
  }
  if (!hasContext) {
    return userIntent;
  }

  switch (mediaType) {
    case 'video':
      return buildVideoQuery(userIntent, storeContext) || userIntent;
    case 'photo':
      return buildPhotoQuery(userIntent, storeContext) || userIntent;
    case 'background':
      return buildBackgroundQuery(userIntent, storeContext) || userIntent;
    case 'logo':
      return buildLogoQuery(userIntent, storeContext) || userIntent;
    default:
      return buildPhotoQuery(userIntent, storeContext) || userIntent;
  }
}

export default { buildMediaSearchQuery };
