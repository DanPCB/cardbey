/**
 * Placement-agnostic render model — hosts own DOM/layout.
 */

/**
 * @param {import('../sharedTypes/index.js').RankedCta | null | undefined} ranked
 * @param {import('../sharedTypes/index.js').CtaPlacement} [placement]
 * @param {Record<string, unknown>} [styleHints]
 * @returns {import('../sharedTypes/index.js').CtaRenderModel | null}
 */
export function buildRenderModel(ranked, placement = 'sticky', styleHints = {}) {
  if (!ranked) return null;
  return {
    id: `${ranked.capabilityId}:${ranked.variantId}`,
    capabilityId: ranked.capabilityId,
    variantId: ranked.variantId,
    label: ranked.label,
    sublabel: ranked.sublabel,
    action: ranked.action,
    deepLink: ranked.deepLink,
    placement,
    provider: ranked.provider,
    analyticsId: ranked.analyticsId,
    proposedAction: ranked.proposedAction,
    styleHints: {
      safeArea: true,
      avoidNav: true,
      avoidSupportOrb: true,
      avoidComposer: true,
      ...styleHints,
    },
    meta: {
      score: ranked.score,
      slot: ranked.slot,
      reasons: ranked.reasons,
    },
  };
}

/**
 * @param {import('../sharedTypes/index.js').CtaEvaluateResult} result
 * @param {{ primaryPlacement?: import('../sharedTypes/index.js').CtaPlacement }} [opts]
 */
export function buildRenderBundle(result, opts = {}) {
  const primaryPlacement = opts.primaryPlacement || 'sticky';
  return {
    primary: buildRenderModel(result.primary, primaryPlacement),
    secondary: (result.secondary || []).map((r) => buildRenderModel(r, 'inline')),
    deferred: (result.deferred || []).map((r) => buildRenderModel(r, 'section')),
    context: result.context,
  };
}
