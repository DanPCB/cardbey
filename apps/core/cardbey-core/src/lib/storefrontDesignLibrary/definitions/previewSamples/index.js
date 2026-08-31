import { SAMPLE_CONTENT_POLICY_DISPOSABLE } from '../../contracts/previewSample.js';

/**
 * Lightweight disposable demo payloads — not authoritative business facts.
 * sourceTemplateId uses ContentTemplate slug as a stable logical id (not DB uuid).
 *
 * @type {import('../../contracts/previewSample.js').StorefrontPreviewSample[]}
 */
export const PREVIEW_SAMPLE_DEFINITIONS = [
  {
    id: 'beauty-and-wellness',
    version: 1,
    name: 'Beauty & wellness',
    description: 'Pre-designed direction for beauty / wellness (sample facts disposable).',
    blueprintId: 'service-booking',
    themeId: 'warm-natural',
    sampleBusiness: {
      name: 'Sample Beauty Studio',
      industry: 'beauty',
      tagline: 'Demo only — replace with your business',
    },
    sampleMedia: [],
    tags: ['beauty', 'wellness', 'booking'],
    recommendedBusinessModels: ['service_booking'],
    sourceTemplateId: 'beauty-wellness-website',
    sampleContentPolicy: SAMPLE_CONTENT_POLICY_DISPOSABLE,
    metadata: {
      sourceTemplateSlug: 'beauty-wellness-website',
      alternateThemeId: 'minimal-white',
    },
  },
  {
    id: 'restaurant-and-cafe',
    version: 1,
    name: 'Restaurant & café',
    description: 'Pre-designed hospitality direction (sample facts disposable).',
    blueprintId: 'restaurant-menu',
    themeId: 'warm-natural',
    sampleBusiness: {
      name: 'Sample Café',
      industry: 'hospitality',
      tagline: 'Demo only — replace with your business',
    },
    sampleMedia: [],
    tags: ['restaurant', 'cafe', 'menu'],
    recommendedBusinessModels: ['restaurant'],
    sourceTemplateId: 'restaurant-cafe-website',
    sampleContentPolicy: SAMPLE_CONTENT_POLICY_DISPOSABLE,
    metadata: {
      sourceTemplateSlug: 'restaurant-cafe-website',
    },
  },
  {
    id: 'retail-store',
    version: 1,
    name: 'Retail store',
    description: 'Pre-designed retail direction (sample facts disposable).',
    blueprintId: 'retail-commerce',
    themeId: 'minimal-white',
    sampleBusiness: {
      name: 'Sample Retail Store',
      industry: 'retail',
      tagline: 'Demo only — replace with your business',
    },
    sampleMedia: [],
    tags: ['retail', 'commerce'],
    recommendedBusinessModels: ['retail'],
    sourceTemplateId: 'retail-store-website',
    sampleContentPolicy: SAMPLE_CONTENT_POLICY_DISPOSABLE,
    metadata: {
      sourceTemplateSlug: 'retail-store-website',
    },
  },
  {
    id: 'trades-and-services',
    version: 1,
    name: 'Trades & services',
    description: 'Pre-designed trades / quote-led direction (sample facts disposable).',
    blueprintId: 'trade-lead-generation',
    themeId: 'premium-blue',
    sampleBusiness: {
      name: 'Sample Trade Services',
      industry: 'trades',
      tagline: 'Demo only — replace with your business',
    },
    sampleMedia: [],
    tags: ['trades', 'services', 'quote'],
    recommendedBusinessModels: ['service_quote'],
    sourceTemplateId: 'trades-home-services-website',
    sampleContentPolicy: SAMPLE_CONTENT_POLICY_DISPOSABLE,
    metadata: {
      sourceTemplateSlug: 'trades-home-services-website',
    },
  },
];
