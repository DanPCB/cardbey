/**
 * Runtime JS sibling for Node without TS remapping.
 * Keep behavior aligned with businessDataNormalizer.ts.
 */

export function cleanString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length ? trimmed : null;
}

/** Keep digits and a single leading +; used for dedup + display. */
export function normalizePhone(value) {
  const s = cleanString(value);
  if (!s) return null;
  const hasPlus = s.trim().startsWith('+');
  const digits = s.replace(/[^0-9]/g, '');
  if (!digits) return null;
  return (hasPlus ? '+' : '') + digits;
}

/** Normalize a website to its origin + path, lowercased host, no trailing slash. */
export function normalizeWebsite(value) {
  const s = cleanString(value);
  if (!s) return null;
  let candidate = s;
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    const host = u.host.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    const query = u.search || '';
    return `${u.protocol}//${host}${path}${query}`;
  } catch {
    return null;
  }
}

/** Host only (for looser website dedup). */
export function websiteHost(value) {
  const w = normalizeWebsite(value);
  if (!w) return null;
  try {
    return new URL(w).host.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function normalizeOpeningHours(value) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const lines = value.map((v) => cleanString(v)).filter(Boolean);
    return lines.length ? { lines } : null;
  }
  if (typeof value === 'object') {
    const obj = value;
    const rawLines = Array.isArray(obj.weekday_text)
      ? obj.weekday_text
      : Array.isArray(obj.lines)
        ? obj.lines
        : null;
    const lines = rawLines
      ? rawLines.map((v) => cleanString(v)).filter(Boolean)
      : undefined;
    return { lines, raw: obj.raw ?? value };
  }
  const single = cleanString(value);
  return single ? { lines: [single] } : null;
}

export function normalizePhotos(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const v of value) {
    const s = cleanString(v);
    if (s && /^https?:\/\//i.test(s)) out.push(s);
  }
  return out;
}

export function clampConfidence(n) {
  const num = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num));
}

/** Base trust per source before field-completeness adjustments. */
const SOURCE_BASE_CONFIDENCE = {
  google_places: 0.7,
  website: 0.55,
  schema_org: 0.6,
  social: 0.4,
  upload: 0.45,
  manual: 0.5,
  apple_maps: 0.65,
  yelp: 0.6,
  facebook_page: 0.5,
};

/**
 * Compute confidence from source trust + completeness of key identifying fields.
 * Returns 0..1.
 */
export function computeConfidence(input) {
  if (input.override != null) return clampConfidence(input.override);
  let score = SOURCE_BASE_CONFIDENCE[input.source] ?? 0.4;
  if (input.name) score += 0.05;
  if (input.phone) score += 0.1;
  if (input.website) score += 0.1;
  if (input.address) score += 0.08;
  if (typeof input.reviewCount === 'number' && input.reviewCount > 5) score += 0.05;
  if (typeof input.rating === 'number' && input.rating > 0) score += 0.02;
  if (input.name && !input.phone && !input.website && !input.address) score -= 0.15;
  return clampConfidence(score);
}

/** Normalize an arbitrary raw fact bag into consistent fields. */
export function normalizeFacts(raw) {
  const lat = typeof raw.lat === 'number' ? raw.lat : null;
  const lng = typeof raw.lng === 'number' ? raw.lng : null;
  const locationRaw = cleanString(raw.location) ?? cleanString(raw.address);
  const location =
    lat != null || lng != null || locationRaw
      ? { lat, lng, raw: locationRaw }
      : null;

  let socialLinks = null;
  if (raw.socialLinks && typeof raw.socialLinks === 'object' && !Array.isArray(raw.socialLinks)) {
    const obj = {};
    for (const [k, v] of Object.entries(raw.socialLinks)) {
      const s = cleanString(v);
      if (s) obj[k] = s;
    }
    socialLinks = Object.keys(obj).length ? obj : null;
  }

  return {
    name: cleanString(raw.name),
    category: cleanString(raw.category) ?? cleanString(raw.type),
    address: cleanString(raw.address),
    phone: normalizePhone(raw.phone),
    website: normalizeWebsite(raw.website),
    openingHours: normalizeOpeningHours(raw.openingHours),
    photos: normalizePhotos(raw.photos),
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    reviewCount: typeof raw.reviewCount === 'number' ? raw.reviewCount : null,
    location,
    socialLinks,
  };
}
