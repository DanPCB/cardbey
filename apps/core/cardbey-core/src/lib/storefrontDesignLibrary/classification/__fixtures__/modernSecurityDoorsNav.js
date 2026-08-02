/**
 * Generic website-nav fixture shaped like a trades business (MSD-like).
 * Not hardcoded into the classifier — used only by tests.
 */

/** @type {Array<{ name: string, url?: string, type?: string, expectedRole: string }>} */
export const MODERN_SECURITY_DOORS_NAV_FIXTURE = [
  {
    name: 'Plantation Shutters Melbourne',
    url: '/plantation-shutters-melbourne',
    type: 'service_category',
    expectedRole: 'service_category',
  },
  { name: 'Fly Doors', url: '/fly-doors', type: 'service_category', expectedRole: 'service_category' },
  { name: 'Fly Screen', url: '/fly-screen', type: 'service_category', expectedRole: 'service_category' },
  {
    name: 'Security Windows',
    url: '/security-windows',
    type: 'service_category',
    expectedRole: 'service_category',
  },
  {
    name: 'Convert manual to electric Rollershutter',
    url: '/convert-manual',
    expectedRole: 'service',
  },
  { name: 'Sheer & Curtain', url: '/sheer', type: 'service_category', expectedRole: 'service_category' },
  {
    name: 'Security Doors & Screen',
    url: '/security-doors',
    type: 'service_category',
    expectedRole: 'service_category',
  },
  {
    name: 'Roller Shutters',
    url: '/roller-shutters',
    type: 'service_category',
    expectedRole: 'service_category',
  },
  { name: 'Roller Blinds', url: '/roller-blinds', type: 'service_category', expectedRole: 'service_category' },
  {
    name: 'Glass Door Melbourne',
    url: '/glass-door',
    type: 'service_category',
    expectedRole: 'service_category',
  },
  { name: 'Testimonials', url: '/testimonials', expectedRole: 'testimonial' },
  { name: 'Why Choose Us', url: '/why-choose-us', expectedRole: 'trust_content' },
  { name: 'Career', url: '/career', expectedRole: 'career' },
  { name: 'Return & Guarantee', url: '/return-guarantee', expectedRole: 'policy' },
  { name: 'Payment Policy', url: '/payment-policy', expectedRole: 'policy' },
  { name: 'Customer Policy', url: '/customer-policy', expectedRole: 'policy' },
  { name: 'Terms & Conditions', url: '/terms', expectedRole: 'policy' },
];
