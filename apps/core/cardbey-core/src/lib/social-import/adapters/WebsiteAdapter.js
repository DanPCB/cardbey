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
import { deepCrawlProducts } from '../ProductPageCrawler.js';

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

  let payload;
  try {
    payload = buildPayloadFromHtml(sourceUrl, html);
  } catch {
    payload = buildPartialPayload(sourceUrl, html);
  }

  console.log(
    '[WebsiteAdapter] products from schema:',
    payload.products?.length ?? 0,
    'triggering crawl:',
    !Array.isArray(payload.products) || payload.products.length === 0,
  );

  if (!Array.isArray(payload.products) || payload.products.length === 0) {
    try {
      console.log('[WebsiteAdapter] starting deep crawl for:', sourceUrl);
      const crawledProducts = await deepCrawlProducts(html, sourceUrl, {
        maxProductPages: 3,
        maxProducts: 20,
      });
      console.log('[WebsiteAdapter] crawled products:', crawledProducts.length);
      if (crawledProducts.length > 0) {
        payload.products = crawledProducts;
        payload.productSource = 'crawled';
      }
    } catch (e) {
      console.warn('[WebsiteAdapter] product crawl failed:', e?.message || e);
    }
  } else {
    payload.productSource = 'schema';
  }

  console.log('[WebsiteAdapter] final payload hero:', payload.coverPhoto, payload.profilePhoto);

  return payload;
}

/**
 * @param {object | null | undefined} node
 * @returns {boolean}
 */
function isPlaceholderSchema(node) {
  if (!node) return true;

  const name = typeof node.name === 'string' ? node.name.toLowerCase() : '';
  const addrLocality = node.address?.addressLocality ?? '';
  const addrRegion = node.address?.addressRegion ?? '';
  const addrStreet = node.address?.streetAddress ?? '';

  if (name.includes('.com') || name.includes('.au') || name.includes('.net') || name.includes('.org')) {
    return true;
  }

  const vnPlaceholders = [
    'hà nội',
    'ha noi',
    'hanoi',
    'hồ chí minh',
    'ho chi minh',
    'việt nam',
    'viet nam',
    'vietnam',
    'đà nẵng',
    'da nang',
  ];
  const addrFull = [addrLocality, addrRegion, addrStreet].join(' ').toLowerCase();
  if (vnPlaceholders.some((p) => addrFull.includes(p))) {
    return true;
  }

  if (addrStreet && addrLocality && addrStreet.toLowerCase() === addrLocality.toLowerCase()) {
    return true;
  }

  return false;
}

/**
 * @param {string} html
 * @param {string} baseUrl
 * @returns {{ name: string | null, phone: string | null, email: string | null, address: string | null, logo: string | null, heroImage: string | null }}
 */
function extractFromDom(html, baseUrl) {
  let name = null;
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    name = titleMatch[1]
      .split(/[|\-–—]/)[0]
      .trim()
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ');
    if (!name || name.length > 80 || name.includes('.com') || name.includes('.au')) {
      name = null;
    }
  }
  if (!name) {
    const logoAlt =
      html.match(/<img[^>]*logo[^>]*alt=["']([^"']+)["']/i) ||
      html.match(/alt=["']([^"']+)["'][^>]*logo/i);
    if (logoAlt) {
      name = logoAlt[1].trim().replace(/\s+PTY\s+LTD\.?/i, '').replace(/\s+/g, ' ').trim();
    }
  }
  if (!name) {
    const skipTitleRe = /^(home|rss|menu|search|cart|login|sign\s*in|contact|about|back)$/i;
    const titleAttrs = [...html.matchAll(/\btitle=["']([^"']{4,80})["']/gi)];
    for (const m of titleAttrs) {
      const candidate = m[1].trim();
      if (
        skipTitleRe.test(candidate) ||
        /^rss[\s.]/i.test(candidate) ||
        candidate.includes('.com') ||
        candidate.includes('.au')
      ) {
        continue;
      }
      name = candidate.replace(/\s+PTY\s+LTD\.?/i, '').replace(/\s+/g, ' ').trim();
      if (name) break;
    }
  }

  const phonePatterns = [
    /href="tel:([^"]+)"/i,
    /(\+61[\s.]?[2-9][\s.]?\d{4}[\s.]?\d{4})/,
    /(04\d{2}[.\s]?\d{3}[.\s]?\d{3})/,
    /(\(0[2-9]\)\s?\d{4}\s?\d{4})/,
    /(0[2-9][\s.]?\d{4}[\s.]?\d{4})/,
  ];
  let phone = null;
  for (const p of phonePatterns) {
    const m = html.match(p);
    if (m) {
      phone = m[1].replace(/[.\s]/g, '').trim();
      if (phone.startsWith('+61')) {
        phone = `0${phone.slice(3)}`;
      }
      break;
    }
  }

  let address = null;
  const auAddrPattern =
    /(\d+[^,\n]{3,50},\s*[A-Za-z\s]{2,30}\s+(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s+\d{4}(?:,?\s*Australia)?)/i;
  const addrMatch = html.match(auAddrPattern);
  if (addrMatch) {
    address = addrMatch[1].replace(/\s+/g, ' ').trim();
  }
  if (!address) {
    const auAddrNoCommaPattern =
      /(\d+\/?\d*\s+[^<\n]{5,70}\s+(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s+\d{4}(?:,?\s*Australia)?)/i;
    const addrMatch2 = html.match(auAddrNoCommaPattern);
    if (addrMatch2) {
      address = addrMatch2[1].replace(/\s+/g, ' ').trim();
    }
  }

  let email = null;
  const mailMatch = html.match(/href="mailto:([^"?]+)"/i);
  if (mailMatch) {
    email = mailMatch[1].trim().toLowerCase();
  }
  if (!email) {
    const emailPattern = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-z]{2,}/;
    const emailMatch = html.match(emailPattern);
    if (emailMatch && !emailMatch[0].includes('example') && !emailMatch[0].includes('youremail')) {
      email = emailMatch[0].toLowerCase();
    }
  }

  let logo = null;
  const logoPatterns = [
    /src="([^"]*logo[^"]*\.(png|jpg|jpeg|webp|svg))"/i,
    /src="([^"]*Logo[^"]*\.(png|jpg|jpeg|webp|svg))"/,
  ];
  for (const p of logoPatterns) {
    const m = html.match(p);
    if (m) {
      try {
        logo = new URL(m[1], baseUrl).href;
      } catch {
        continue;
      }
      break;
    }
  }

  let heroImage = null;
  const bannerPatterns = [
    /(?:banner|hero|slider|carousel|slide-img)[^>]*src="([^"]+)"/i,
    /src="([^"]*(?:banner|hero|slider|bg)[^"]*\.(jpg|jpeg|png|webp))"/i,
    /data-src="([^"]*(?:banner|hero|slider)[^"]*\.(jpg|jpeg|png|webp))"/i,
    /background(?:-image)?:\s*url\(['"]?([^'")]+)['"]?\)/i,
  ];
  for (const p of bannerPatterns) {
    const m = html.match(p);
    if (m && m[1] && !m[1].match(/logo|icon|favicon/i)) {
      try {
        heroImage = new URL(m[1], baseUrl).href;
        break;
      } catch {
        continue;
      }
    }
  }

  return { name, phone, email, address, logo, heroImage };
}

function buildPayloadFromHtml(sourceUrl, html) {
  const jsonLd = extractJsonLd(html);
  const schema = findBusinessSchema(jsonLd);

  const schemaIsPlaceholder = isPlaceholderSchema(schema);
  const dom = extractFromDom(html, sourceUrl);
  console.log('[WebsiteAdapter] dom extracted:', {
    name: dom.name,
    phone: dom.phone,
    heroImage: dom.heroImage,
    logo: dom.logo,
  });

  let name = '';
  if (schema && !schemaIsPlaceholder) {
    name = pickString(schema.name) ?? '';
  }
  if (!name || name.includes('.com') || name.includes('.au')) {
    name =
      dom.name ??
      extractMetaContent(html, 'og:site_name') ??
      extractMetaContent(html, 'og:title') ??
      '';
    if (name) {
      name = name.split(/[|\-–—]/)[0].trim();
    }
  }

  let phone =
    dom.phone ??
    (schema && !schemaIsPlaceholder ? normalizePhone(pickString(schema.telephone)) : null) ??
    '';

  let email =
    dom.email ?? (schema && !schemaIsPlaceholder ? pickString(schema.email) : null) ?? '';

  let address = '';
  if (schema && !schemaIsPlaceholder) {
    address = formatPostalAddress(schema.address);
  }
  if (!address || isPlaceholderSchema(schema)) {
    address = dom.address ?? '';
  }

  let hours = schema && !schemaIsPlaceholder ? normalizeHours(schema.openingHours) : null;

  let logo = schema && !schemaIsPlaceholder ? pickImageUrl(schema.logo) : null;
  logo = logo ?? dom.logo ?? '';

  let image = schema && !schemaIsPlaceholder ? pickImageUrl(schema.image) : null;
  image = image ?? dom.heroImage ?? '';

  let description = schema ? pickString(schema.description) : '';
  let priceRange = schema ? pickString(schema.priceRange) : '';
  const category = schema ? pickString(schema.servesCuisine) || inferCategoryFromSchema(schema) : '';
  let products = schema && !schemaIsPlaceholder ? mapOfferCatalog(schema.hasOfferCatalog) : [];
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
