/**
 * Tagline extraction from website HTML.
 */

import { firstHeading, metaContent } from './htmlUtils.js';

const VIETNAMESE_RE = /[\u00C0-\u1EF9]/;

function cleanOgTitle(ogTitle: string, businessName: string | null): string | null {
  const trimmed = ogTitle.trim();
  if (!trimmed || trimmed.length > 120) return null;
  if (businessName) {
    const suffix = new RegExp(`\\s*[|\\-–—]\\s*${businessName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
    const cleaned = trimmed.replace(suffix, '').trim();
    if (cleaned.length >= 8 && cleaned.length <= 80) return cleaned;
  }
  return trimmed.length <= 80 ? trimmed : null;
}

export function extractTagline(
  html: string,
  businessName: string | null,
  category: string | null,
): string | null {
  const h1 = firstHeading(html);
  if (h1 && h1.length < 80 && !VIETNAMESE_RE.test(h1)) {
    return h1;
  }

  const ogTitle = metaContent(html, 'og:title');
  if (ogTitle) {
    const cleaned = cleanOgTitle(ogTitle, businessName);
    if (cleaned && !VIETNAMESE_RE.test(cleaned)) return cleaned;
  }

  if (businessName && category) {
    const fallback = `${businessName} — ${category}`;
    if (fallback.length <= 80) return fallback;
  }

  return null;
}
