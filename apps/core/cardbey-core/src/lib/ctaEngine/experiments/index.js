/**
 * Experiment flags for CTA variants — thin adapter over context.featureFlags.
 */

/**
 * @param {import('../sharedTypes/index.js').CtaSemanticContext} ctx
 * @param {string} experimentKey
 * @param {string} [defaultBucket]
 * @returns {string}
 */
export function resolveExperimentBucket(ctx, experimentKey, defaultBucket = 'control') {
  const flags = ctx.featureFlags || {};
  const raw = flags[experimentKey];
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (raw === true) return 'treatment';
  if (raw === false) return 'control';
  return defaultBucket;
}

/**
 * Prefer treatment variant id when experiment is on.
 * @param {import('../sharedTypes/index.js').CtaVariant[]} variants
 * @param {import('../sharedTypes/index.js').CtaSemanticContext} ctx
 * @param {string} experimentKey
 * @param {string} treatmentVariantId
 */
export function pickExperimentVariant(variants, ctx, experimentKey, treatmentVariantId) {
  const bucket = resolveExperimentBucket(ctx, experimentKey);
  if (bucket === 'treatment') {
    const hit = variants.find((v) => v.id === treatmentVariantId);
    if (hit) return hit;
  }
  return variants[0] ?? null;
}
