import { section } from '../../contracts/blueprint.js';

/** @type {import('../../contracts/blueprint.js').StorefrontBlueprint} */
export const RETAIL_COMMERCE_BLUEPRINT = {
  id: 'retail-commerce',
  version: 1,
  name: 'Retail commerce',
  description: 'Product and category commerce structure.',
  preferredBusinessModels: ['retail'],
  supportedContentRoles: [
    'product',
    'product_category',
    'gallery',
    'testimonial',
    'about',
    'contact',
  ],
  supportedActions: ['buy', 'add_to_cart', 'contact'],
  requiredData: ['businessName'],
  optionalData: ['products', 'brands', 'delivery'],
  defaultSections: [
    section('hero', { defaultPriority: 10, fallbackBehavior: 'request_input', requiredData: ['businessName'] }),
    section('products', { defaultPriority: 20, fallbackBehavior: 'allow_suggested' }),
    section('featured_items', { defaultPriority: 30, fallbackBehavior: 'collapse' }),
    section('offers', { defaultPriority: 40, fallbackBehavior: 'hide' }),
    section('brands', { defaultPriority: 50, fallbackBehavior: 'hide' }),
    section('testimonials', { defaultPriority: 60, fallbackBehavior: 'hide' }),
    section('contact', { defaultPriority: 90, fallbackBehavior: 'collapse' }),
    section('footer', { defaultPriority: 100, fallbackBehavior: 'collapse' }),
  ],
  compatibilityWeights: {
    businessModel: 1,
    contentCoverage: 0.9,
    actionFit: 1,
    mediaAvailability: 0.6,
  },
};
