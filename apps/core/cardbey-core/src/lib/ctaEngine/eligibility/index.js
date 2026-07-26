/**
 * Eligibility rules — auth, flags, completion, dismiss, audience, dependencies.
 */

/**
 * @param {import('../sharedTypes/index.js').CtaCapability} capability
 * @param {import('../sharedTypes/index.js').CtaSemanticContext} ctx
 * @returns {{ ok: boolean, reason?: string }}
 */
export function isCapabilityEligible(capability, ctx) {
  if (!capability) return { ok: false, reason: 'missing_capability' };

  if (capability.requiresAuth && !ctx.authenticated) {
    return { ok: false, reason: 'auth_required' };
  }

  const audiences = capability.supportedAudiences || [];
  if (audiences.length && ctx.audience && !audiences.includes(ctx.audience)) {
    return { ok: false, reason: 'audience_mismatch' };
  }

  const flags = capability.requiredFeatureFlags || [];
  for (const flag of flags) {
    if (ctx.featureFlags?.[flag] === false) {
      return { ok: false, reason: `flag_off:${flag}` };
    }
  }

  const completed = new Set(ctx.completedCapabilityIds || []);
  if (capability.completionKey && completed.has(capability.completionKey)) {
    return { ok: false, reason: 'completed' };
  }
  if (completed.has(capability.id)) {
    return { ok: false, reason: 'completed' };
  }

  for (const dep of capability.dependencies || []) {
    if (!completed.has(dep)) {
      return { ok: false, reason: `dependency:${dep}` };
    }
  }

  return { ok: true };
}

/**
 * @param {import('../sharedTypes/index.js').CtaVariant} variant
 * @param {import('../sharedTypes/index.js').CtaSemanticContext} ctx
 * @returns {{ ok: boolean, reason?: string }}
 */
export function isVariantEligible(variant, ctx) {
  if (!variant) return { ok: false, reason: 'missing_variant' };
  if ((ctx.dismissedCtaIds || []).includes(variant.id)) {
    return { ok: false, reason: 'dismissed' };
  }
  const contexts = variant.contexts || [];
  if (contexts.length && ctx.section && !contexts.includes(ctx.section) && !contexts.includes('*')) {
    // Section mismatch → deferred later, still eligible for ranking as deferred
    return { ok: true, reason: 'section_deferred' };
  }
  return { ok: true };
}
