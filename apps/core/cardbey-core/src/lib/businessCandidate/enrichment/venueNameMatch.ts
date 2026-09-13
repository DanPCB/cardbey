/**
 * Shared venue/business name match for enrichment media identity.
 * Used by Foursquare, OSM, Wikimedia — never accept results[0] without this bar.
 */

export const VENUE_NAME_MATCH_MIN = 0.85;

export function normalizeVenueName(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Token overlap / containment confidence between a query business name and a remote title.
 * Same bar as Wikimedia Commons (0.85+ required for attach).
 */
export function venueNameMatchConfidence(
  businessName: string | null | undefined,
  remoteName: string | null | undefined,
): number {
  const a = normalizeVenueName(businessName);
  const b = normalizeVenueName(remoteName)
    .replace(/^file:/i, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .trim();
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.95;
  const aTokens = a.split(/\s+/).filter((t) => t.length > 2);
  if (!aTokens.length) return 0;
  const hits = aTokens.filter((t) => b.includes(t)).length;
  return hits / aTokens.length;
}

export function isStrongVenueNameMatch(
  businessName: string | null | undefined,
  remoteName: string | null | undefined,
  minConfidence = VENUE_NAME_MATCH_MIN,
): boolean {
  return venueNameMatchConfidence(businessName, remoteName) >= minConfidence;
}

/**
 * Pick best named row by confidence; returns null when nothing meets the bar.
 * Never falls back to results[0].
 */
export function pickBestNamedVenue<T>(
  businessName: string,
  rows: T[],
  getName: (row: T) => string | null | undefined,
  minConfidence = VENUE_NAME_MATCH_MIN,
): { row: T; confidence: number } | null {
  let best: { row: T; confidence: number } | null = null;
  for (const row of rows) {
    const confidence = venueNameMatchConfidence(businessName, getName(row));
    if (confidence < minConfidence) continue;
    if (!best || confidence > best.confidence) {
      best = { row, confidence };
    }
  }
  return best;
}

/** True when two website hosts refer to the same site (www-insensitive). */
export function websiteHostsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ha = hostOfUrl(a);
  const hb = hostOfUrl(b);
  return Boolean(ha && hb && ha === hb);
}

export function hostOfUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const raw = url.trim();
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProto).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}
