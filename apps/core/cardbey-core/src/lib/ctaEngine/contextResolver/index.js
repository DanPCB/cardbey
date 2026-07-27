/**
 * Semantic context resolver — never rely on route names alone.
 */

/**
 * Infer pageKind from route / extras when not provided.
 * @param {Partial<import('../sharedTypes/index.js').CtaSemanticContext>} raw
 * @returns {string}
 */
function inferPageKind(raw) {
  if (raw.pageKind) return String(raw.pageKind);
  const route = String(raw.route || '').toLowerCase();
  if (route.includes('/app') || route.includes('performer') || route.includes('console')) {
    return 'performer';
  }
  if (route.includes('/s/') || route.includes('store') || route.includes('preview')) {
    return 'storefront';
  }
  if (route.includes('discover') || route.includes('claim')) return 'discovery';
  if (route === '/' || route.includes('marketplace') || route.includes('feed')) {
    return 'marketplace';
  }
  if (route.includes('partner') || route.includes('pricing') || route.includes('learn')) {
    return 'marketing';
  }
  return 'unknown';
}

/**
 * Infer journey stage from completed capabilities + auth.
 * @param {Partial<import('../sharedTypes/index.js').CtaSemanticContext>} raw
 * @returns {string}
 */
function inferJourneyStage(raw) {
  if (raw.journeyStage) return String(raw.journeyStage);
  const done = new Set(raw.completedCapabilityIds || []);
  if (done.has('create_store') || done.has('create_profile')) {
    if (done.has('launch_loyalty') || done.has('create_campaign')) return 'grow';
    return 'operate';
  }
  if (raw.authenticated) return 'create';
  return 'explore';
}

/**
 * @param {Partial<import('../sharedTypes/index.js').CtaSemanticContext> | null | undefined} raw
 * @returns {import('../sharedTypes/index.js').CtaSemanticContext}
 */
export function evaluateContext(raw = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const authenticated = Boolean(input.authenticated);
  /** @type {import('../sharedTypes/index.js').CtaAudience} */
  const audience =
    input.audience ||
    (authenticated ? 'authenticated' : 'guest');

  return {
    route: input.route ?? null,
    pageKind: inferPageKind(input),
    section: input.section ?? null,
    scrollRatio:
      typeof input.scrollRatio === 'number' && Number.isFinite(input.scrollRatio)
        ? Math.min(1, Math.max(0, input.scrollRatio))
        : null,
    missionId: input.missionId ?? null,
    storeId: input.storeId ?? null,
    businessType: input.businessType ?? null,
    commerceMode: input.commerceMode ?? null,
    authenticated,
    audience,
    completedCapabilityIds: [...(input.completedCapabilityIds || [])],
    dismissedCtaIds: [...(input.dismissedCtaIds || [])],
    recentActivity: [...(input.recentActivity || [])],
    featureFlags: { ...(input.featureFlags || {}) },
    device: input.device || 'mobile',
    language: input.language || 'en',
    journeyStage: inferJourneyStage(input),
    extras: { ...(input.extras || {}) },
  };
}
