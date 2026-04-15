/**
 * Universal SME classifier: always run for generation.
 * Input: businessType (primary), businessName (secondary), location, notes.
 * Output: profile JSON for seed builder and validators.
 * Minimal wrapper over classifyBusiness + resolveAudience; adds businessModel.
 */

import { classifyBusiness } from './classifyBusinessService.js';
import { resolveAudience } from '../../lib/verticals/verticalTaxonomy.js';

/** Map verticalGroup to businessModel for seed builder: services | retail | food */
const GROUP_TO_BUSINESS_MODEL = {
  food: 'food',
  retail: 'retail',
  fashion: 'retail',
  beauty: 'retail',
  entertainment: 'services',
  health: 'services',
  home: 'services',
  auto: 'services',
  education: 'services',
  events: 'services',
  services: 'services',
};

/**
 * Classify business into a full profile for the SME pipeline.
 * @param {{ businessType?: string, businessName?: string, location?: string, notes?: string }} inputs
 * @returns {Promise<{ verticalGroup: string, verticalSlug: string, businessModel: 'food'|'retail'|'services', audience: string, keywords: string[], confidence: number, businessDescriptionShort?: string }>}
 */
export async function classifyBusinessProfile(inputs = {}) {
  const { businessType = '', businessName = '', location = '', notes = '' } = inputs;
  const classification = await classifyBusiness({
    businessType: (businessType || '').toString(),
    businessName: (businessName || '').toString(),
    location: (location || '').toString(),
    notes: (notes || '').toString(),
  });
  const audience = resolveAudience({ businessType, businessName });
  const verticalGroup = (classification.verticalGroup || 'services').toLowerCase().trim();
  const businessModel = GROUP_TO_BUSINESS_MODEL[verticalGroup] || 'services';

  return {
    verticalGroup,
    verticalSlug: classification.verticalSlug || 'services.generic',
    businessModel,
    audience: audience || 'adults',
    keywords: Array.isArray(classification.keywords) ? classification.keywords : [],
    confidence: typeof classification.confidence === 'number' ? classification.confidence : 0.5,
    ...(classification.businessDescriptionShort != null ? { businessDescriptionShort: classification.businessDescriptionShort } : {}),
  };
}
