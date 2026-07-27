/**
 * Per-vertical product options schema (lightweight). Attached to catalog/draft metadata; UI can ignore.
 */

/**
 * @param {string} verticalSlug - e.g. food.cafe, beauty.nails, fashion.boutique
 * @returns {{ productTypeDefaults: object, optionGroups: object[], pricingRules: object }}
 */
export function buildOptionsSchema(verticalSlug) {
  const slug = (verticalSlug || '').toString().toLowerCase().trim();
  const group = slug.split('.')[0] || 'services';

  const base = {
    productTypeDefaults: {},
    optionGroups: [],
    pricingRules: { allowCustomPrice: true },
  };

  if (group === 'food') {
    base.optionGroups = [
      { key: 'size', label: 'Size', type: 'single', options: ['Small', 'Regular', 'Large'] },
      { key: 'extras', label: 'Add-ons', type: 'multi', options: [] },
      { key: 'spice_level', label: 'Spice level', type: 'single', options: ['Mild', 'Medium', 'Hot'] },
      { key: 'meal_combo', label: 'Combo', type: 'single', options: ['Solo', 'Meal deal'] },
    ];
    base.productTypeDefaults = { category: 'food' };
    return base;
  }

  if (group === 'beauty' || group === 'health') {
    base.optionGroups = [
      { key: 'duration', label: 'Duration', type: 'single', options: ['30 min', '45 min', '60 min', '90 min'] },
      { key: 'staff_preference', label: 'Staff', type: 'single', options: [] },
      { key: 'add_ons', label: 'Add-ons', type: 'multi', options: ['Gel removal', 'Nail art', 'Extra massage'] },
      { key: 'booking_required', label: 'Booking', type: 'single', options: ['Walk-in', 'Book ahead'] },
    ];
    base.productTypeDefaults = { category: 'service' };
    return base;
  }

  if (group === 'fashion' || group === 'retail') {
    base.optionGroups = [
      { key: 'size', label: 'Size', type: 'single', options: ['XS', 'S', 'M', 'L', 'XL'] },
      { key: 'color', label: 'Colour', type: 'single', options: [] },
      { key: 'variant_sku', label: 'Variant', type: 'single', options: [] },
    ];
    base.productTypeDefaults = { category: 'product' };
    return base;
  }

  if (group === 'services' || group === 'home' || group === 'auto' || group === 'education' || group === 'events') {
    base.optionGroups = [
      { key: 'service_tier', label: 'Tier', type: 'single', options: ['Standard', 'Premium', 'Express'] },
      { key: 'quote_required', label: 'Quote', type: 'single', options: ['Fixed price', 'Quote on request'] },
      { key: 'appointment_slots', label: 'When', type: 'single', options: [] },
    ];
    base.productTypeDefaults = { category: 'service' };
    return base;
  }

  return base;
}
