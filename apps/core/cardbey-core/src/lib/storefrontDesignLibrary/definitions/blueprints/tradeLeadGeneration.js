import { section } from '../../contracts/blueprint.js';

/** @type {import('../../contracts/blueprint.js').StorefrontBlueprint} */
export const TRADE_LEAD_GENERATION_BLUEPRINT = {
  id: 'trade-lead-generation',
  version: 1,
  name: 'Trade lead generation',
  description: 'Quote-led trades and local service structure (no demo facts).',
  preferredBusinessModels: ['service_quote'],
  supportedContentRoles: [
    'service',
    'service_category',
    'project',
    'gallery',
    'testimonial',
    'trust_content',
    'about',
    'contact',
    'location',
    'policy',
  ],
  supportedActions: ['request_quote', 'call', 'enquire'],
  requiredData: ['businessName'],
  optionalData: ['phone', 'serviceArea', 'testimonials', 'projects'],
  defaultSections: [
    section('hero', { defaultPriority: 10, fallbackBehavior: 'request_input', requiredData: ['businessName'] }),
    section('service_categories', { defaultPriority: 20, fallbackBehavior: 'collapse' }),
    section('services', { defaultPriority: 30, fallbackBehavior: 'allow_suggested' }),
    section('trust', { defaultPriority: 40, fallbackBehavior: 'hide' }),
    section('projects', { defaultPriority: 50, fallbackBehavior: 'hide' }),
    section('testimonials', { defaultPriority: 60, fallbackBehavior: 'hide' }),
    section('service_area', { defaultPriority: 70, fallbackBehavior: 'collapse' }),
    section('quote', { defaultPriority: 80, fallbackBehavior: 'request_input' }),
    section('contact', { defaultPriority: 90, fallbackBehavior: 'request_input' }),
    section('footer', { defaultPriority: 100, fallbackBehavior: 'collapse' }),
  ],
  compatibilityWeights: {
    businessModel: 1,
    contentCoverage: 0.8,
    actionFit: 1,
    mediaAvailability: 0.4,
  },
};
