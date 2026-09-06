/**
 * Name / location confidence for Google Places published-store backfill.
 * Prefer null over wrong business contact data.
 */

const GENERIC_NAME_RE =
  /^(my|mmm|another|new|abc|the)?\s*(fashion|fashion store|spring collection|new fashion shoes)\b/i;

const STOP = new Set([
  'the',
  'and',
  'pty',
  'ltd',
  'cafe',
  'restaurant',
  'bar',
  'shop',
  'store',
  'spa',
  'massage',
  'kitchen',
  'bakery',
  'barber',
  'salon',
  'group',
  'capital',
  'services',
  'australian',
  'melbourne',
]);

/** Common Melbourne suburbs / place tokens that appear in slugs. */
const SLUG_PLACE_TOKENS = [
  'footscray',
  'braybrook',
  'keysborough',
  'sunshine',
  'carlton',
  'southbank',
  'elsternwick',
  'williamstown',
  'stalbans',
  'st-albans',
  'moonee',
  'ponds',
  'aspandale',
  'delahey',
  'ravenhall',
  'bayswater',
  'deerpark',
  'deer-park',
  'clayton',
  'collingwood',
  'brunswick',
  'docklands',
  'richmond',
  'malvern',
];

export function normalizeName(value) {
  return String(value || '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function significantTokens(value) {
  return normalizeName(value)
    .split(' ')
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

export function isGenericBusinessName(name) {
  const n = String(name || '').trim();
  if (!n) return true;
  if (GENERIC_NAME_RE.test(n)) return true;
  if (/^recycling/i.test(n)) return true;
  if (/shop2\$/i.test(n)) return true;
  // Too vague single-word fashion/nails without distinctive brand
  if (/^(fashion|nails|homestay|spa)$/i.test(n)) return true;
  return false;
}

/**
 * True when store name and Places display name refer to the same business.
 */
export function namesLikelyMatch(storeName, foundName) {
  const a = normalizeName(storeName);
  const b = normalizeName(foundName);
  if (!a || !b) return false;
  if (a === b) return true;

  // Containment when the shorter side is distinctive enough (e.g. "co do", "galaxsigns")
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 5 && longer.includes(shorter)) return true;

  const ta = significantTokens(storeName);
  const tb = significantTokens(foundName);
  if (!ta.length || !tb.length) return false;

  const hits = ta.filter((t) =>
    tb.some((u) => u === t || (t.length >= 4 && u.includes(t)) || (u.length >= 4 && t.includes(u))),
  );

  if (hits.length >= 2) return true;
  if (hits.length === 1 && ta.length === 1) return true;
  // Single-token brand like "Galaxsigns" / "Brunetti"
  if (ta.length === 1 && tb.some((u) => u.startsWith(ta[0]) || ta[0].startsWith(u))) {
    return ta[0].length >= 5;
  }
  return false;
}

export function placeHintsFromSlug(slug) {
  const s = String(slug || '').toLowerCase();
  return SLUG_PLACE_TOKENS.filter((tok) => s.includes(tok.replace(/-/g, '')) || s.includes(tok));
}

/**
 * When slug encodes a suburb (pho-ngon-footscray), require that token in the address.
 */
export function addressMatchesSlugHints(address, slug) {
  const hints = placeHintsFromSlug(slug);
  if (!hints.length) return true;
  const a = normalizeName(address);
  if (!a) return false;
  return hints.some((h) => a.includes(normalizeName(h)));
}

/**
 * Location gate: still require AU/VN plausibility; Melbourne-only is weak —
 * callers must also pass namesLikelyMatch.
 */
export function addressMatchesExpectedLocation(address, store) {
  if (!address) return false;
  const a = address.toLowerCase();
  const country = (store.country || 'AU').toUpperCase();

  if (country === 'VN') {
    return /vietnam|việt|hcmc|ho chi minh|saigon|sài gòn|hanoi|hà nội/.test(a);
  }

  const auHints = /\baustralia\b|\bvic\b|\bnsw\b|\bqld\b|\bsa\b|\bwa\b|\btas\b|\bact\b|\bnt\b/;
  if (!auHints.test(a) && !/\b\d{4}\b/.test(a)) return false;

  if (!addressMatchesSlugHints(address, store.slug)) return false;

  const expectedTokens = [store.suburb, store.city, store.formattedAddress, store.address]
    .filter((t) => t && String(t).trim() && String(t).trim().toLowerCase() !== 'melbourne')
    .map((t) => String(t).toLowerCase());

  if (expectedTokens.length) {
    const hit = expectedTokens.some((tok) => {
      const words = tok.split(/[\s,]+/).filter((w) => w.length > 2);
      return words.some((w) => a.includes(w));
    });
    if (hit) return true;
    // Specific suburb on store but not in address → reject (do not fall back to any VIC)
    const hasSpecificSuburb =
      store.suburb &&
      String(store.suburb).trim() &&
      String(store.suburb).trim().toLowerCase() !== 'melbourne';
    if (hasSpecificSuburb) return false;
  }

  // Melbourne-only / no suburb: AU/VIC ok geographically; name match is the real gate
  return /\baustralia\b|\bvic\b|\bmelbourne\b/.test(a);
}

export function pickBestPlaceCandidate(storeName, candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  for (const c of list) {
    if (c && namesLikelyMatch(storeName, c.name)) return c;
  }
  return null;
}
