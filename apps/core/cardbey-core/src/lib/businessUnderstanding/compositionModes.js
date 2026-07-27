/**
 * Phase 8 — Brand adaptation modes for composition/rendering.
 */

/** @typedef {import('./businessUnderstandingTypes.js').BrandAdaptationMode} BrandAdaptationMode */
/** @typedef {import('./businessUnderstandingTypes.js').RenderChannel} RenderChannel */

/** @type {Record<BrandAdaptationMode, { label: string; description: string }>} */
export const BRAND_ADAPTATION_MODE_META = Object.freeze({
  faithful_reconstruction: {
    label: 'Faithful reconstruction',
    description: 'Preserve uploaded design as closely as possible when digitising existing assets.',
  },
  brand_consistent: {
    label: 'Brand consistent',
    description:
      'Default — preserve brand identity while improving spacing, alignment, hierarchy, accessibility, and responsive layout.',
  },
  brand_inspired: {
    label: 'Brand inspired',
    description:
      'Generate new assets using extracted brand language without losing visual identity.',
  },
});

/**
 * Default adaptation mode by artifact context.
 *
 * @param {{ artifactType?: string; digitizeExisting?: boolean }} input
 * @returns {BrandAdaptationMode}
 */
export function resolveDefaultAdaptationMode(input = {}) {
  if (input.digitizeExisting === true) return 'faithful_reconstruction';
  return 'brand_consistent';
}

/**
 * Channels supported by composition engine (Phase 9 — renderer consumes these).
 */
export const SUPPORTED_RENDER_CHANNELS = Object.freeze([
  'desktop',
  'mobile',
  'wallet',
  'tv',
  'pos',
  'qr_landing',
  'print_pdf',
]);

export default {
  BRAND_ADAPTATION_MODE_META,
  resolveDefaultAdaptationMode,
  SUPPORTED_RENDER_CHANNELS,
};
