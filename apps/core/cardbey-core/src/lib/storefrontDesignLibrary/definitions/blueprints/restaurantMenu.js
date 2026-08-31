import { section } from '../../contracts/blueprint.js';

/** @type {import('../../contracts/blueprint.js').StorefrontBlueprint} */
export const RESTAURANT_MENU_BLUEPRINT = {
  id: 'restaurant-menu',
  version: 1,
  name: 'Restaurant menu',
  description: 'Menu- and hospitality-led structure.',
  preferredBusinessModels: ['restaurant'],
  supportedContentRoles: [
    'menu_item',
    'menu_category',
    'gallery',
    'testimonial',
    'about',
    'contact',
    'location',
  ],
  supportedActions: ['order', 'reserve', 'call', 'get_directions'],
  requiredData: ['businessName'],
  optionalData: ['menu', 'hours', 'reservationUrl', 'deliveryUrl'],
  defaultSections: [
    section('hero', { defaultPriority: 10, fallbackBehavior: 'request_input', requiredData: ['businessName'] }),
    section('menu', { defaultPriority: 20, fallbackBehavior: 'allow_suggested' }),
    section('featured_items', { defaultPriority: 30, fallbackBehavior: 'collapse' }),
    section('offers', { defaultPriority: 40, fallbackBehavior: 'hide' }),
    section('gallery', { defaultPriority: 50, fallbackBehavior: 'hide' }),
    section('testimonials', { defaultPriority: 60, fallbackBehavior: 'hide' }),
    section('booking', { defaultPriority: 70, fallbackBehavior: 'collapse' }),
    section('hours', { defaultPriority: 80, fallbackBehavior: 'collapse' }),
    section('location', { defaultPriority: 90, fallbackBehavior: 'collapse' }),
    section('footer', { defaultPriority: 100, fallbackBehavior: 'collapse' }),
  ],
  compatibilityWeights: {
    businessModel: 1,
    contentCoverage: 0.9,
    actionFit: 0.9,
    mediaAvailability: 0.5,
  },
};
