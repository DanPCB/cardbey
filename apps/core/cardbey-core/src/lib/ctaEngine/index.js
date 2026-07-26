/**
 * CTA Engine — canonical platform capability discovery + CTA selection.
 * @see docs/CTA_ENGINE.md
 */

export * from './api/index.js';
export { CTA_PROVIDERS, CTA_PLACEMENTS } from './sharedTypes/index.js';
export { resolveStorefrontPrimaryCta } from './resolveStorefrontPrimaryCta.js';
export { evaluatePlatformMarketingCta } from './platformMarketing/evaluatePlatformMarketing.js';
export {
  PHASE2_PLATFORM_CAPABILITIES,
  MARKETING_SECTION_CAPABILITY,
} from './platformMarketing/phase2Capabilities.js';
