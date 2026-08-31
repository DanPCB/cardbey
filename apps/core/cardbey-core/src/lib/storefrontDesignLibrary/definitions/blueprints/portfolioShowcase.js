import { section } from '../../contracts/blueprint.js';

/** @type {import('../../contracts/blueprint.js').StorefrontBlueprint} */
export const PORTFOLIO_SHOWCASE_BLUEPRINT = {
  id: 'portfolio-showcase',
  version: 1,
  name: 'Portfolio showcase',
  description: 'Project- and capability-led showcase structure.',
  preferredBusinessModels: ['portfolio', 'service_quote'],
  supportedContentRoles: [
    'project',
    'gallery',
    'service',
    'about',
    'testimonial',
    'contact',
  ],
  supportedActions: ['enquire', 'request_quote', 'contact'],
  requiredData: ['businessName'],
  optionalData: ['projects', 'process', 'gallery'],
  defaultSections: [
    section('hero', { defaultPriority: 10, fallbackBehavior: 'request_input', requiredData: ['businessName'] }),
    section('projects', { defaultPriority: 20, fallbackBehavior: 'allow_suggested' }),
    section('gallery', { defaultPriority: 30, fallbackBehavior: 'collapse' }),
    section('services', { defaultPriority: 40, fallbackBehavior: 'collapse' }),
    section('about', { defaultPriority: 50, fallbackBehavior: 'hide' }),
    section('process', { defaultPriority: 60, fallbackBehavior: 'hide' }),
    section('testimonials', { defaultPriority: 70, fallbackBehavior: 'hide' }),
    section('contact', { defaultPriority: 90, fallbackBehavior: 'request_input' }),
    section('footer', { defaultPriority: 100, fallbackBehavior: 'collapse' }),
  ],
  compatibilityWeights: {
    businessModel: 0.9,
    contentCoverage: 0.8,
    actionFit: 0.8,
    mediaAvailability: 0.9,
  },
};
