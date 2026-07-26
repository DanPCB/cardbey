/**
 * Scroll / section trigger evaluation — suggest section-aligned CTAs without interrupting reading.
 */

/** @type {Record<string, string[]>} */
export const SECTION_CAPABILITY_HINTS = Object.freeze({
  store_creation: ['create_store', 'upload_business_card', 'import_website'],
  loyalty: ['launch_loyalty', 'launch_membership'],
  discovery: ['create_profile', 'become_partner'],
  ai: ['ai_business_assistant'],
  display: ['create_display_screen'],
  creator: ['become_creator'],
  catalog: ['import_menu', 'import_products', 'list_catalog'],
  marketing: ['generate_marketing', 'create_campaign', 'create_promotion'],
  payments: ['connect_stripe'],
  // Phase 2 marketing semantic sections (also accepted via evaluatePlatformMarketing)
  STORE_CREATION: ['create_store'],
  PROFILE_IDENTITY: ['create_profile'],
  PRODUCTS_SERVICES: ['list_catalog'],
  MENU_IMPORT: ['import_menu'],
  LOYALTY: ['launch_loyalty'],
  PLATFORM_OVERVIEW: ['learn_more', 'create_store'],
});

/**
 * @param {import('../sharedTypes/index.js').CtaSemanticContext} ctx
 * @returns {{ section: string|null, suggestedCapabilityIds: string[], autoHide: boolean }}
 */
export function evaluateScrollTriggers(ctx) {
  const section = ctx.section ? String(ctx.section) : null;
  const suggestedCapabilityIds = section ? SECTION_CAPABILITY_HINTS[section] || [] : [];
  const scrollRatio = typeof ctx.scrollRatio === 'number' ? ctx.scrollRatio : 0;
  // Auto-hide sticky while mid-read; reappear near section boundaries / idle (host owns idle).
  const autoHide = scrollRatio > 0.08 && scrollRatio < 0.85 && !section;
  return { section, suggestedCapabilityIds, autoHide };
}

/**
 * Boost deferred CTAs whose section matches hints.
 * @param {import('../sharedTypes/index.js').CtaEvaluateResult} result
 * @param {import('../sharedTypes/index.js').CtaSemanticContext} ctx
 */
export function applyScrollBoost(result, ctx) {
  const { suggestedCapabilityIds } = evaluateScrollTriggers(ctx);
  if (!suggestedCapabilityIds.length) return result;

  const promoted = [];
  const stillDeferred = [];
  for (const row of result.deferred) {
    if (suggestedCapabilityIds.includes(row.capabilityId)) {
      promoted.push({ ...row, slot: 'secondary', score: row.score + 50, reasons: [...(row.reasons || []), 'scroll_section'] });
    } else {
      stillDeferred.push(row);
    }
  }

  if (!promoted.length) return result;

  let primary = result.primary;
  let secondary = [...result.secondary, ...promoted].sort((a, b) => b.score - a.score);
  if (!primary && secondary.length) {
    primary = { ...secondary[0], slot: 'primary' };
    secondary = secondary.slice(1);
  }
  return {
    ...result,
    primary,
    secondary: secondary.slice(0, 3),
    deferred: stillDeferred,
  };
}
