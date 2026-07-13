/**
 * Phase 5 — Brand signal extraction (identity separate from layout and rules).
 */

import { governed } from './confidenceGovernance.js';

/** @typedef {import('./businessUnderstandingTypes.js').BrandProfile} BrandProfile */

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * Infer visual mood from text cues (no image LLM in v1 — optional vision enrich later).
 *
 * @param {string} text
 */
function inferMoodFromText(text) {
  const body = String(text ?? '').toLowerCase();
  /** @type {string[]} */
  const moods = [];
  if (/\b(handcraft|artisan|local|homemade)\b/.test(body)) moods.push('handcrafted', 'local');
  if (/\b(friendly|welcome|family)\b/.test(body)) moods.push('friendly');
  if (/\b(traditional|classic|heritage)\b/.test(body)) moods.push('traditional');
  if (/\b(modern|minimal|clean)\b/.test(body)) moods.push('modern');
  if (/\b(warm|cozy)\b/.test(body)) moods.push('warm');
  if (!moods.length && /\bcoffee|cafe|bakery\b/.test(body)) {
    moods.push('warm', 'local', 'friendly');
  }
  return [...new Set(moods)];
}

/**
 * @param {{
 *   storeName?: string | null;
 *   ocrText?: string | null;
 *   userMessage?: string | null;
 *   layout?: { footerText?: { value?: string } | null; headerText?: { value?: string } | null } | null;
 *   brandColors?: string[];
 *   preseededDraft?: { programName?: string } | null;
 * }} input
 * @returns {BrandProfile}
 */
export function extractBrandProfile(input = {}) {
  const storeName = pickString(
    input.storeName,
    input.preseededDraft?.programName?.replace(/\s+rewards?$/i, ''),
  );
  const footer = pickString(input.layout?.footerText?.value, input.ocrText);
  const header = pickString(input.layout?.headerText?.value);
  const combined = `${header}\n${footer}\n${input.userMessage ?? ''}`.trim();
  const moods = inferMoodFromText(combined);
  const colors = Array.isArray(input.brandColors)
    ? input.brandColors.filter((c) => typeof c === 'string' && c.trim())
    : [];

  return {
    schema: 'cb-brand',
    version: 'v1',
    brandName: storeName
      ? governed(storeName, storeName.length > 2 ? 0.85 : 0.6, 'OBSERVED')
      : null,
    logo: header
      ? governed({ description: 'header_logo_region' }, 0.55, 'INFERRED')
      : null,
    primaryColors: colors.length
      ? governed(colors.slice(0, 3), 0.75, 'OBSERVED')
      : governed(['#4f46e5', '#7c3aed'], 0.45, 'GENERATED'),
    secondaryColors: colors.length > 3
      ? governed(colors.slice(3), 0.65, 'OBSERVED')
      : null,
    typography: combined
      ? governed('sans_serif_promotional', 0.5, 'INFERRED')
      : null,
    visualMood: moods.length
      ? governed(moods, 0.71, 'INFERRED')
      : governed(['friendly'], 0.45, 'INFERRED'),
    shapes: governed('rounded_rectangles', 0.6, 'INFERRED'),
    spacingRhythm: governed('grid_aligned', 0.65, 'INFERRED'),
    composition: governed('header_grid_footer', 0.7, 'INFERRED'),
    iconStyle: governed('line_art_stamps', 0.68, 'INFERRED'),
    backgroundTexture: governed('gradient_fill', 0.55, 'INFERRED'),
    photographyStyle: null,
    illustrationStyle: governed('simple_line_icons', 0.62, 'INFERRED'),
    toneOfLanguage: footer
      ? governed(/[A-Z]{3,}/.test(footer) ? 'promotional_caps' : 'casual', 0.6, 'OBSERVED')
      : null,
  };
}

/**
 * Optional vision enrich — structured brand signals from image (Phase 5b).
 *
 * @param {{ imageUrl?: string | null; missionId?: string | null }} input
 */
export async function enrichBrandProfileFromVision(input = {}) {
  const imageUrl = pickString(input.imageUrl);
  if (!imageUrl) return null;

  try {
    const { getVisionEngine } = await import('../../ai/engines/index.js');
    const vision = getVisionEngine();
    const result = await vision.analyzeImage({ imageUrl, task: 'brand_signals' });
    const { safeParseTopologyJson } = await import('../loyalty/loyaltyTopologyJsonParse.js');
    const parsed = safeParseTopologyJson(result?.text ?? '', { logLabel: 'BrandSignals' });
    if (!parsed || typeof parsed !== 'object') return null;

    return {
      brandName: parsed.brandName
        ? governed(String(parsed.brandName), Number(parsed.brandNameConfidence) || 0.8, 'OBSERVED')
        : null,
      primaryColors: Array.isArray(parsed.primaryColors)
        ? governed(parsed.primaryColors, Number(parsed.colorConfidence) || 0.85, 'OBSERVED')
        : null,
      visualMood: Array.isArray(parsed.visualMood)
        ? governed(parsed.visualMood, Number(parsed.moodConfidence) || 0.72, 'INFERRED')
        : null,
      typography: parsed.typography
        ? governed(String(parsed.typography), 0.7, 'INFERRED')
        : null,
    };
  } catch {
    return null;
  }
}

export default { extractBrandProfile, enrichBrandProfileFromVision };
