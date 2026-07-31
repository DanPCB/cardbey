import { section } from '../../contracts/blueprint.js';

/** @type {import('../../contracts/blueprint.js').StorefrontBlueprint} */
export const SERVICE_BOOKING_BLUEPRINT = {
  id: 'service-booking',
  version: 1,
  name: 'Service booking',
  description: 'Appointment and package-led service structure.',
  preferredBusinessModels: ['service_booking'],
  supportedContentRoles: [
    'service',
    'service_category',
    'gallery',
    'testimonial',
    'about',
    'contact',
    'location',
  ],
  supportedActions: ['book', 'call', 'contact'],
  requiredData: ['businessName'],
  optionalData: ['bookingUrl', 'hours', 'team', 'gallery'],
  defaultSections: [
    section('hero', { defaultPriority: 10, fallbackBehavior: 'request_input', requiredData: ['businessName'] }),
    section('services', { defaultPriority: 20, fallbackBehavior: 'allow_suggested' }),
    section('featured_items', { defaultPriority: 30, fallbackBehavior: 'collapse' }),
    section('about', { defaultPriority: 40, fallbackBehavior: 'hide' }),
    section('gallery', { defaultPriority: 50, fallbackBehavior: 'hide' }),
    section('testimonials', { defaultPriority: 60, fallbackBehavior: 'hide' }),
    section('booking', { defaultPriority: 70, fallbackBehavior: 'request_input' }),
    section('location', { defaultPriority: 80, fallbackBehavior: 'collapse' }),
    section('hours', { defaultPriority: 90, fallbackBehavior: 'collapse' }),
    section('footer', { defaultPriority: 100, fallbackBehavior: 'collapse' }),
  ],
  compatibilityWeights: {
    businessModel: 1,
    contentCoverage: 0.8,
    actionFit: 1,
    mediaAvailability: 0.5,
  },
};
