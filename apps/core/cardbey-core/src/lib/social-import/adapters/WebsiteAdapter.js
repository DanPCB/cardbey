/**
 * WebsiteAdapter — extract business data from arbitrary website URLs.
 * Reuses scrapeUtils for HTTP fetch, JSON-LD, and OpenGraph parsing.
 */

import {
  fetchHtml,
  renderHtmlWithBrowser,
  extractMetaContent,
  extractTitle,
  extractJsonLd,
  jsonLdTypeIncludes,
  decodeHtmlEntities,
} from '../scrapeUtils.js';

export const platform = 'website';

const FETCH_TIMEOUT_MS = 10_000;

const BUSINESS_JSON_LD_TYPES = [
  'LocalBusiness',
  'Restaurant',
  'Store',
  'TouristAttraction',
  'Hotel',
  'HealthAndBeautyBusiness',
  'SportsActivityLocation',
  'FoodEstablishment',
  'TravelAgency',
  'Organization',
];

const AU_PHONE_RE = /(\+61|0)[2-9]\d{8}|04\d{8}/g;
const INTL_PHONE_RE = /\+?\d[\d\s\-()]{8,}/g;
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-z]{2,}/gi;

const SOCIAL_HOST_MAP = [
  ['tiktok.com', 'tiktok'],
  ['facebook.com', 'facebook'],
  ['fb.com', 'facebook'],
  ['instagram.com', 'instagram'],
  ['twitter.com', 'x'],
  ['x.com', 'x'],
  ['youtube.com', 'youtube'],
  ['linkedin.com', 'linkedin'],
];

/**
 * @param {string} url
 * @returns {boolean}
 */
export function matches(url) {
  return false;
}

/**
 * @param {string} url
 * @returns {Promise<object>}
 */
export async function extract(url) {
  const sourceUrl = sanitizeHttpUrl(url);
  if (!sourceUrl) {
    throw { code: 'INVALID_URL' };
  }

  let html = await fetchHtml(sourceUrl, { timeoutMs: FETCH_TIMEOUT_MS });
  if (!html) {
    html = await renderHtmlWithBrowser(sourceUrl, { timeoutMs: FETCH_TIMEOUT_MS });
  }
  if (!html) {
    throw { code: 'SCRAPE_FAILED' };
  }

  try {
    return buildPayloadFromHtml(sourceUrl, html);
  } catch {
    return buildPartialPayload(sourceUrl, html);
  }
}

function buildPayloadFromHtml(sourceUrl, html) {
  const jsonLd = extractJsonLd(html);
  const schema = findBusinessSchema(jsonLd);

  let name = schema ? pickString(schema.name) : '';
  let description = schema ? pickString(schema.description) : '';
  let phone = schema ? normalizePhone(pickString(schema.telephone)) : '';
  let email = schema ? pickString(schema.email) : '';
  let address = schema ? formatPostalAddress(schema.address) : '';
  let hours = schema ? normalizeHours(schema.openingHours) : null;
  let logo = schema ? pickImageUrl(schema.logo) : '';
  let image = schema ? pickImageUrl(schema.image) : '';
  let priceRange = schema ? pickString(schema.priceRange) : '';
  const category = schema ? pickString(schema.servesCuisine) || inferCategoryFromSchema(schema) : '';
  let products = schema ? mapOfferCatalog(schema.hasOfferCatalog) : [];
  let socialLinks = schema ? mapSameAsLinks(schema.sameAs) : {};

  if (!name) {
    name =
      extractMetaContent(html, 'og:site_name') ||
      extractMetaContent(html, 'og:title') ||
      extractTitle(html) ||
      '';
    description = description || extractMetaContent(html, 'og:description') || extractMetaDescription(html);
    image = image || extractMetaContent(html, 'og:image');
  }

  if (!phone && !email) {
    const heuristic = extractHeuristicContact(html);
    phone = heuristic.phone;
    email = heuristic.email;
    socialLinks = { ...socialLinks, ...heuristic.socialLinks };
  }

  const displayName = name || extractDomainName(sourceUrl);
  const brandSignals = deriveBrandSignals(description || '', []);

  return {
    platform,
    sourceUrl,
    profileUrl: sourceUrl,
    businessName: displayName,
    displayName,
    description: description || null,
    bio: description || null,
    category,
    location: address,
    hours,
    contact: { phone: phone || '', email: email || '', website: sourceUrl },
    phone: phone || null,
    email: email || null,
    address: address || null,
    priceRange: priceRange || null,
    profilePhoto: logo || image || '',
    coverPhoto: image || logo || '',
    photos: [logo, image].filter(Boolean),
    posts: [],
    products,
    socialLinks,
    followerCount: null,
    hashtags: [],
    videos: [],
    brandSignals,
    rawSchema: schema || null,
  };
}

function buildPartialPayload(sourceUrl, html) {
  const displayName = extractDomainName(sourceUrl);
  return {
    platform,
    sourceUrl,
    profileUrl: sourceUrl,
    businessName: displayName,
    displayName,
    description: extractMetaContent(html, 'og:description') || null,
    bio: extractMetaContent(html, 'og:description') || null,
    category: '',
    location: '',
    hours: null,
    contact: { phone: '', email: '', website: sourceUrl },
    phone: null,
    email: null,
    address: null,
    priceRange: null,
    profilePhoto: extractMetaContent(html, 'og:image') || '',
    coverPhoto: '',
    photos: [],
    posts: [],
    products: [],
    socialLinks: {},
    followerCount: null,
    hashtags: [],
    videos: [],
    brandSignals: deriveBrandSignals('', []),
    rawSchema: null,
  };
}

function findBusinessSchema(nodes) {
  if (!Array.isArray(nodes)) return null;
  for (const node of nodes) {
    if (BUSINESS_JSON_LD_TYPES.some((t) => jsonLdTypeIncludes(node, t))) {
      return node;
    }
  }
  return null;
}

function mapSameAsLinks(sameAs) {
  const links = {};
  const urls = Array.isArray(sameAs) ? sameAs : sameAs ? [sameAs] : [];
  for (const raw of urls) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const key = detectPlatformFromUrl(raw);
    if (key && !links[key]) links[key] = raw.trim();
  }
  return links;
}

function detectPlatformFromUrl(url) {
  const lower = String(url).toLowerCase();
  for (const [host, key] of SOCIAL_HOST_MAP) {
    if (lower.includes(host)) return key;
  }
  return null;
}

function mapOfferCatalog(catalog) {
  const items = catalog?.itemListElement;
  if (!Array.isArray(items)) return [];
  return items
    .map((entry) => {
      const item = entry?.item && typeof entry.item === 'object' ? entry.item : entry;
      const name = pickString(item?.name);
      if (!name) return null;
      const offers = item?.offers;
      const priceRaw = Array.isArray(offers) ? offers[0]?.price : offers?.price;
      const price = typeof priceRaw === 'number' ? priceRaw : Number(priceRaw) || 0;
      return {
        name,
        description: pickString(item?.description),
        price,
        category: 'Services',
      };
    })
    .filter(Boolean);
}

function extractHeuristicContact(html) {
  const phones = new Set();
  const emails = new Set();
  const socialLinks = {};

  const telMatches = html.matchAll(/href=["']tel:([^"']+)["']/gi);
  for (const m of telMatches) {
    const normalized = normalizePhone(decodeHtmlEntities(m[1]));
    if (normalized) phones.add(normalized);
  }

  const mailMatches = html.matchAll(/href=["']mailto:([^"'?]+)/gi);
  for (const m of mailMatches) {
    const email = decodeHtmlEntities(m[1]).trim().toLowerCase();
    if (email) emails.add(email);
  }

  const auMatches = html.match(AU_PHONE_RE) || [];
  for (const m of auMatches) {
    const normalized = normalizePhone(m);
    if (normalized) phones.add(normalized);
  }

  if (phones.size === 0) {
    const intlMatches = html.match(INTL_PHONE_RE) || [];
    for (const m of intlMatches) {
      const normalized = normalizePhone(m);
      if (normalized && normalized.length >= 9) phones.add(normalized);
    }
  }

  const emailMatches = html.match(EMAIL_RE) || [];
  for (const m of emailMatches) {
    emails.add(m.trim().toLowerCase());
  }

  const anchorRe = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  let anchor;
  while ((anchor = anchorRe.exec(html)) !== null) {
    const href = decodeHtmlEntities(anchor[1]);
    const key = detectPlatformFromUrl(href);
    if (key && !socialLinks[key] && /^https?:\/\//i.test(href)) {
      socialLinks[key] = href;
    }
  }

  return {
    phone: [...phones][0] || '',
    email: [...emails][0] || '',
    socialLinks,
  };
}

function deriveBrandSignals(description, hashtags) {
  const text = `${description} ${(hashtags || []).join(' ')}`.toLowerCase();
  let tone = 'friendly';
  if (/luxur|premium|exclusive|bespoke|fine/i.test(text)) tone = 'luxury';
  else if (/minimal|simple|clean/i.test(text)) tone = 'minimal';
  else if (/bold|vibrant|fun|playful/i.test(text)) tone = 'bold';

  let style = 'modern';
  if (/vintage|retro|classic|heritage|traditional/i.test(text)) style = 'vintage';
  else if (/warm|cozy|homely/i.test(text)) style = 'warm';

  return { tone, style };
}

function extractDomainName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return String(url || '').trim() || 'website';
  }
}

function sanitizeHttpUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

function pickString(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return '';
}

function normalizePhone(value) {
  if (!value) return '';
  return String(value).replace(/[\s\-()]/g, '').trim();
}

function formatPostalAddress(address) {
  if (!address) return '';
  if (typeof address === 'string') return address.trim();
  if (typeof address !== 'object') return '';
  const parts = [
    pickString(address.streetAddress),
    pickString(address.addressLocality),
    pickString(address.addressRegion),
    pickString(address.postalCode),
  ].filter(Boolean);
  return parts.join(', ');
}

function normalizeHours(openingHours) {
  if (!openingHours) return null;
  if (Array.isArray(openingHours)) return openingHours;
  if (typeof openingHours === 'string') return openingHours;
  return null;
}

function pickImageUrl(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object' && typeof value.url === 'string') return value.url.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = pickImageUrl(item);
      if (url) return url;
    }
  }
  return '';
}

function extractMetaDescription(html) {
  if (typeof html !== 'string') return '';
  const m = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i);
  return m?.[1] ? decodeHtmlEntities(m[1]) : '';
}

function inferCategoryFromSchema(schema) {
  const type = schema?.['@type'];
  const types = Array.isArray(type) ? type : [type];
  const joined = types.map((t) => String(t || '').toLowerCase()).join(' ');
  if (joined.includes('restaurant') || joined.includes('food')) return 'restaurant';
  if (joined.includes('travel')) return 'travel';
  if (joined.includes('beauty') || joined.includes('health')) return 'beauty';
  if (joined.includes('store') || joined.includes('retail')) return 'retail';
  return '';
}

export default { platform, matches, extract };
