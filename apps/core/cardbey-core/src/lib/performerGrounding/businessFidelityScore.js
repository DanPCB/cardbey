/**
 * Business fidelity scoring for grounded content.
 */

/**
 * @param {{
 *   evidence?: import('./performerGroundingTypes.js').BusinessContentEvidence;
 *   catalogDraft?: import('./performerGroundingTypes.js').SourceGroundedCatalogDraft;
 * }} input
 * @returns {import('./performerGroundingTypes.js').BusinessFidelityScore}
 */
export function computeBusinessFidelityScore(input) {
  const evidence = input.evidence;
  const draft = input.catalogDraft;
  const counts = draft?.counts ?? { exact: 0, verified: 0, inferred: 0, fallback: 0, total: 0 };
  const total = Math.max(1, counts.total);
  const exactCoverage = (counts.exact + counts.verified) / total;
  const fallbackRatio = counts.fallback / total;

  const identityConf = Number(evidence?.businessIdentity?.sourceConfidence) || 0;
  const catalogConf = draft?.overallConfidence ?? evidence?.catalogEvidence?.confidence ?? 0;
  const pricingConf = draft?.missingContent?.some((m) => m.startsWith('conflict:')) ? 0.55 : 0.85;
  const missing = Array.isArray(draft?.missingContent) ? draft.missingContent : [];
  const mediaMissing = missing.filter((m) => m.startsWith('no_image:')).length;
  const onlyImageGaps =
    mediaMissing > 0 && missing.every((m) => String(m).startsWith('no_image:'));
  // When catalog is evidence-backed and the only gaps are images, treat media as deferred
  // (Mission 001: image reconstruction is not the current optimisation target).
  const mediaConf =
    onlyImageGaps && exactCoverage >= 0.4
      ? 0.8
      : total > 0
        ? Math.max(0, 1 - mediaMissing / total)
        : 0.5;
  const brandingConf = evidence?.businessIdentity?.logoUrl ? 0.9 : 0.6;

  const identity = Math.round(identityConf * 100);
  const catalog = Math.round(catalogConf * 100);
  const pricing = Math.round(pricingConf * 100);
  const media = Math.round(mediaConf * 100);
  const branding = Math.round(brandingConf * 100);
  const overall = Math.round((identity + catalog + pricing + media + branding) / 5);

  const blockers = [];
  if (fallbackRatio > 0.5) blockers.push('high_fallback_ratio');
  if (counts.total === 0) blockers.push('empty_catalog');
  if ((evidence?.conflicts ?? []).length > 0) blockers.push('unresolved_conflicts');
  if (identity < 50) blockers.push('low_identity_confidence');

  return {
    overall,
    identity,
    catalog,
    pricing,
    media,
    branding,
    exactCoverage: Math.round(exactCoverage * 100),
    fallbackRatio: Math.round(fallbackRatio * 100),
    blockers,
  };
}

export default { computeBusinessFidelityScore };
