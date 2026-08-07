/**
 * Fixtures for Projection Renderer Cutover V1 (not hardcoded into production classifiers).
 */

/** @type {Array<{ name: string, type?: string, expectedRole: string }>} */
export const BEAUTY_BOOKING_FIXTURE = [
  { name: 'Haircut', type: 'service', expectedRole: 'service' },
  { name: 'Colour', type: 'service', expectedRole: 'service' },
  { name: 'Blow Dry', type: 'service', expectedRole: 'service' },
  { name: 'Book Online', type: 'service', expectedRole: 'service' },
];

/** @type {Array<{ name: string, type?: string, expectedRole: string }>} */
export const RESTAURANT_FIXTURE = [
  { name: 'Entrées', type: 'menu_category', expectedRole: 'menu_category' },
  { name: 'Mains', type: 'menu_category', expectedRole: 'menu_category' },
  { name: 'Grilled Barramundi', type: 'menu_item', expectedRole: 'menu_item' },
  { name: 'Reserve a table', expectedRole: 'service' },
];

/** @type {Array<{ name: string, type?: string, expectedRole: string, price?: number }>} */
export const RETAIL_FIXTURE = [
  { name: 'T-Shirts', type: 'product_category', expectedRole: 'product_category' },
  { name: 'Classic Tee', type: 'product', expectedRole: 'product', price: 29 },
  { name: 'Hoodie', type: 'product', expectedRole: 'product', price: 79 },
];

/** @type {Array<{ name: string, type?: string, expectedRole: string }>} */
export const PORTFOLIO_AGENCY_FIXTURE = [
  { name: 'Brand Identity', type: 'project', expectedRole: 'project' },
  { name: 'Campaign Work', type: 'project', expectedRole: 'project' },
  { name: 'Testimonials', expectedRole: 'testimonial' },
  { name: 'About the studio', expectedRole: 'about' },
];

/** Grounded incomplete — sparse sourced catalogue (no invented fillers). */
/** @type {Array<{ name: string, type?: string, expectedRole: string, contentOrigin?: string }>} */
export const GROUNDED_INCOMPLETE_FIXTURE = [
  {
    name: 'Security Door Install',
    type: 'service',
    expectedRole: 'service',
    contentOrigin: 'sourced',
  },
];
