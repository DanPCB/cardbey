/**
 * Template Library feature flags — risky capabilities default off in production.
 */

export const TEMPLATE_FEATURE_FLAGS = {
  ENABLE_TEMPLATE_LIBRARY: 'ENABLE_TEMPLATE_LIBRARY',
  ENABLE_TEMPLATE_EDITOR: 'ENABLE_TEMPLATE_EDITOR',
  ENABLE_TEMPLATE_WEBSITE_LAYOUTS: 'ENABLE_TEMPLATE_WEBSITE_LAYOUTS',
  ENABLE_TEMPLATE_CARD_LAYOUTS: 'ENABLE_TEMPLATE_CARD_LAYOUTS',
  ENABLE_TEMPLATE_PUBLIC_LIBRARY: 'ENABLE_TEMPLATE_PUBLIC_LIBRARY',
  ENABLE_TEMPLATE_COMMUNITY_PUBLISHING: 'ENABLE_TEMPLATE_COMMUNITY_PUBLISHING',
  ENABLE_TEMPLATE_PRINT_EXPORT: 'ENABLE_TEMPLATE_PRINT_EXPORT',
  ENABLE_TEMPLATE_PERFORMER_RECOMMENDATIONS: 'ENABLE_TEMPLATE_PERFORMER_RECOMMENDATIONS',
};

/** @param {string} flag */
export function isTemplateFeatureEnabled(flag) {
  const envKey = `TEMPLATE_FLAG_${flag}`;
  const direct = process.env[flag];
  const prefixed = process.env[envKey];
  if (direct === 'true' || direct === '1') return true;
  if (direct === 'false' || direct === '0') return false;
  if (prefixed === 'true' || prefixed === '1') return true;
  if (prefixed === 'false' || prefixed === '0') return false;
  if (
    flag === TEMPLATE_FEATURE_FLAGS.ENABLE_TEMPLATE_LIBRARY ||
    flag === TEMPLATE_FEATURE_FLAGS.ENABLE_TEMPLATE_EDITOR ||
    flag === TEMPLATE_FEATURE_FLAGS.ENABLE_TEMPLATE_CARD_LAYOUTS ||
    flag === TEMPLATE_FEATURE_FLAGS.ENABLE_TEMPLATE_WEBSITE_LAYOUTS
  ) {
    return process.env.NODE_ENV !== 'production';
  }
  return false;
}
