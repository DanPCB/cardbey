/**
 * Structured content extraction from OCR text for asset-intent Read → Display → Ask.
 */

/** @typedef {'event'|'promotion'|'store'|'business'|'graphic'|'catalog'|'menu'|'document'} AssetContentType */

/**
 * @param {string} text
 * @returns {AssetContentType}
 */
export function detectContentType(text) {
  const lower = String(text ?? '').toLowerCase();
  if (!lower.trim()) return 'document';
  if (/\b(tour|festival|event|concert|gala|workshop|seminar|webinar)\b/.test(lower)) return 'event';
  if (/\b(sale|discount|promo|promotion|off\b|% off|limited time)\b/.test(lower)) return 'promotion';
  if (/\b(menu|dish|appetizer|entree|beverage|drink)\b/.test(lower)) return 'menu';
  if (/\b(catalog|product list|sku|item #)\b/.test(lower)) return 'catalog';
  if (/\b(design|graphic|logo|brand kit|poster)\b/.test(lower)) return 'graphic';
  if (/\b(store|shop|boutique|retail)\b/.test(lower)) return 'store';
  if (/\b(business|company|pty ltd|inc\.|llc)\b/.test(lower)) return 'business';
  return 'document';
}

/**
 * @param {string} ocrText
 * @returns {{
 *   title: string;
 *   subtitle: string;
 *   description: string;
 *   items: string[];
 *   detectedType: AssetContentType;
 *   rawText: string;
 *   keyPoints: string[];
 * }}
 */
export function extractAssetContent(ocrText) {
  const rawText = String(ocrText ?? '').trim();
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) {
    return {
      title: 'Uploaded asset',
      subtitle: '',
      description: '',
      items: [],
      detectedType: 'document',
      rawText: '',
      keyPoints: [],
    };
  }

  const bulletItems = lines
    .filter((l) => /^[•\-*]\s/.test(l) || /^\d+[.)]\s/.test(l))
    .map((l) => l.replace(/^[•\-*]\s*/, '').replace(/^\d+[.)]\s*/, '').trim())
    .filter(Boolean);

  const nonBullet = lines.filter((l) => !/^[•\-*]\s/.test(l) && !/^\d+[.)]\s/.test(l));
  const title = nonBullet[0] ?? lines[0] ?? 'Uploaded asset';
  const subtitle = nonBullet[1] ?? '';
  const description = nonBullet.slice(2, 6).join(' ').slice(0, 400);
  const detectedType = detectContentType(rawText);
  const keyPoints = nonBullet.slice(0, 5);

  return {
    title,
    subtitle,
    description,
    items: bulletItems.length ? bulletItems : nonBullet.slice(1, 6),
    detectedType,
    rawText: rawText.slice(0, 2000),
    keyPoints,
  };
}
