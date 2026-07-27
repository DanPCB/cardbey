/**
 * Pure helpers for POST /api/tools/catalog-preflight (no I/O).
 * Extract business profile + priced line items from flattened PDF text.
 */

/**
 * @param {string} text
 * @returns {{
 *   businessName: string;
 *   phone: string | null;
 *   address: string | null;
 *   suburb: string | null;
 *   website: string | null;
 *   email: string | null;
 *   category: string;
 * }}
 */
export function extractBusinessProfileFromText(text) {
  const raw = String(text || '');
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const nameLine =
    lines.find(
      (l) =>
        !/^\$|^\d{2,}|\.(com|au)\b|@|\d{3}.*\d{4}/i.test(l) &&
        l.length > 3 &&
        l.length < 60 &&
        !/^(page|www\.)\b/i.test(l),
    ) ?? '';

  const phoneMatch = raw.match(/(\(0\d\)\s?\d{4}\s?\d{4}|04\d{2}\s?\d{3}\s?\d{3}|\(\d{2,4}\)\s?\d{3,4}\s?\d{3,4})/);

  const addressMatch = raw.match(/[\w\s,.-]+(VIC|NSW|QLD|WA|SA|TAS|NT|ACT)\s*\d{4}/i);

  const websiteMatch = raw.match(/(?:www\.|https?:\/\/)[^\s)]+/i);

  const emailMatch = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

  const lower = raw.toLowerCase();
  let category = 'general';
  if (/\bwash\b|car wash|detailing|carwash/.test(lower)) category = 'automotive';
  else if (/\bcafe\b|coffee|restaurant|food|menu|dish|dining/.test(lower)) category = 'food';
  else if (/\bhair\b|beauty|salon|nail|spa/.test(lower)) category = 'beauty';
  else if (/furniture|sofa|chair|table|decor/.test(lower)) category = 'furniture';
  else if (/gym|fitness|yoga|training|wellness/.test(lower)) category = 'fitness';

  let suburb = null;
  if (addressMatch) {
    const parts = addressMatch[0].split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      suburb = parts[parts.length - 2] || null;
    }
  }

  return {
    businessName: nameLine,
    phone: phoneMatch?.[0] ?? null,
    address: addressMatch?.[0] ?? null,
    suburb,
    website: websiteMatch?.[0] ?? null,
    email: emailMatch?.[0] ?? null,
    category,
  };
}

/**
 * @param {string} text
 * @returns {Array<{ name: string; price: number; allPrices: number[]; category: string; source: string }>}
 */
export function extractCatalogItemsFromText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim());
  const items = [];
  let currentCategory = null;
  const sectionRe = /^[A-Z][A-Z\s&/]{3,40}$/;
  const priceRe = /\$?(\d{2,4}(?:\.\d{2})?)/g;

  for (const line of lines) {
    if (!line) continue;
    if (sectionRe.test(line) && !/^\$/.test(line) && !line.includes('PACK')) {
      currentCategory = line;
      continue;
    }
    const prices = [...line.matchAll(priceRe)].map((m) => parseFloat(m[1])).filter((n) => Number.isFinite(n));
    if (prices.length > 0) {
      const name = line
        .replace(/\$?\d{2,4}(?:\.\d{2})?/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (name.length > 1) {
        items.push({
          name,
          price: Math.min(...prices),
          allPrices: prices,
          category: currentCategory ?? 'Services',
          source: 'pdf_extract',
        });
      }
    }
  }
  return items;
}

/**
 * @param {ReturnType<typeof extractBusinessProfileFromText>} profile
 * @param {ReturnType<typeof extractCatalogItemsFromText>} items
 */
export function buildCatalogPreflightIntent(profile, items) {
  const n = items.length;
  const base =
    `Create a store for ${profile.businessName || 'my business'}` +
    (profile.suburb ? ` in ${profile.suburb}` : '') +
    ` — ${profile.category} business`;
  const tail = n > 0 ? ` with ${n} services extracted from catalog` : '';
  return base + tail;
}
