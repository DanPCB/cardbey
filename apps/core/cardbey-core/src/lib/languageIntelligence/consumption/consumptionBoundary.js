/**
 * Architectural boundary: surfaces consume via this module — not TranslationEngine directly.
 */

export const CONSUMPTION_BOUNDARY_VERSION = 'localization-consumption-v1';

/**
 * Surfaces that may later wire through consumption (not wired in 5A).
 */
export const PLANNED_CONSUMER_SURFACES = Object.freeze([
  'dashboard_chrome',
  'campaign',
  'crm_inbox',
  'conversation',
  'storefront_public',
]);

/**
 * Documented boundary check for future lint / review.
 * @param {string} surface
 * @param {{ callsEngineDirectly?: boolean }} [opts]
 */
export function assertConsumptionBoundary(surface, opts = {}) {
  if (opts.callsEngineDirectly) {
    throw new Error(
      `[languageIntelligence.consumption] Surface "${surface}" must not call TranslationEngine directly. ` +
        'Use consumeLocalizedContent() / buildLocalizedConsumption().',
    );
  }
  return Object.freeze({
    ok: true,
    surface: String(surface ?? ''),
    version: CONSUMPTION_BOUNDARY_VERSION,
    authoritative: false,
  });
}
