/** @type {Record<string, import('../industryBlueprintRegistry.js').IndustryBlueprint>} */
export const AUTO_BLUEPRINTS = {
  'auto.repair': {
    id: 'auto.repair',
    industry: 'automotive',
    label: 'Auto Repair',
    verticalSlugs: ['auto.repair'],
    templateKey: 'home_services',
    categories: [
      { key: 'maintenance', label: 'Maintenance' },
      { key: 'repairs', label: 'Repairs & Diagnostics' },
      { key: 'tyres', label: 'Tyres & Brakes' },
      { key: 'quotes', label: 'Inspections' },
    ],
    imageQueryHints: {
      maintenance: ['mechanic oil change garage', 'log book car service'],
      repairs: ['engine diagnostics workshop', 'car air conditioning service'],
      tyres: ['brake inspection mechanic', 'wheel alignment garage'],
      quotes: ['pre purchase car inspection mechanic'],
    },
    items: [
      { categoryKey: 'maintenance', name: 'Log Book Service', description: 'Manufacturer-scheduled service to keep your warranty valid.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 199, priceUnit: 'service', imageQueryHint: 'mechanic log book car service' },
      { categoryKey: 'maintenance', name: 'Oil Change', description: 'Engine oil and filter replacement with fluid top-up.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 89, priceUnit: 'service', imageQueryHint: 'oil change car workshop' },
      { categoryKey: 'maintenance', name: 'Tyre Rotation', description: 'Rotate tyres for even wear and extended life.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 45, priceUnit: 'service', imageQueryHint: 'tyre rotation mechanic' },
      { categoryKey: 'repairs', name: 'Engine Diagnostics', description: 'Computer scan and fault diagnosis for warning lights.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 120, priceUnit: 'service', imageQueryHint: 'engine diagnostics obd scan' },
      { categoryKey: 'repairs', name: 'Air Conditioning Service', description: 'A/C regas, leak check, and cabin filter replacement.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 150, priceUnit: 'service', imageQueryHint: 'car air conditioning regas' },
      { categoryKey: 'repairs', name: 'Battery Replacement', description: 'Test, supply, and fit a new battery with disposal.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 180, priceUnit: 'service', imageQueryHint: 'car battery replacement mechanic' },
      { categoryKey: 'tyres', name: 'Brake Inspection', description: 'Pad, rotor, and fluid check with safety report.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 69, priceUnit: 'inspection', imageQueryHint: 'brake pad inspection mechanic' },
      { categoryKey: 'tyres', name: 'Wheel Alignment', description: 'Precision alignment to reduce tyre wear and improve handling.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 89, priceUnit: 'service', imageQueryHint: 'wheel alignment machine garage' },
      { categoryKey: 'tyres', name: 'Tyre Fitting', description: 'Supply and fit new tyres with balancing.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 35, priceUnit: 'tyre', imageQueryHint: 'tyre fitting workshop' },
      { categoryKey: 'quotes', name: 'Pre-purchase Inspection', description: 'Detailed inspection before you buy a used vehicle.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 150, priceUnit: 'inspection', imageQueryHint: 'used car inspection mechanic' },
    ],
    promptHints: 'Generate realistic automotive workshop services with fixed or from-price service fees.',
    websiteCopy: {
      uspItems: [
        { icon: '✦', label: 'Qualified mechanics', description: 'Log book servicing and repairs done right.' },
        { icon: '⚡', label: 'Quick turnaround', description: 'Book common services with clear upfront pricing.' },
        { icon: '♥', label: 'Vehicle care', description: 'Diagnostics, brakes, tyres, and A/C under one roof.' },
      ],
      heroImageKeywords: ['auto repair workshop mechanic', 'car service garage'],
      ctaLabel: 'Book service',
    },
  },
  'auto.detailing': {
    id: 'auto.detailing',
    industry: 'automotive',
    label: 'Car Detailing',
    verticalSlugs: ['auto.detailing'],
    templateKey: 'home_services',
    categories: [
      { key: 'exterior', label: 'Exterior' },
      { key: 'interior', label: 'Interior' },
      { key: 'packages', label: 'Packages' },
    ],
    items: [
      { categoryKey: 'exterior', name: 'Exterior Wash & Wax', description: 'Hand wash, dry, and protective wax finish.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 80, priceUnit: 'service' },
      { categoryKey: 'exterior', name: 'Paint Correction', description: 'Remove swirls and light scratches with machine polish.', serviceMode: 'quote_required', pricingModel: 'from_price', fromPrice: 350, priceUnit: 'service' },
      { categoryKey: 'exterior', name: 'Ceramic Coating', description: 'Long-lasting paint protection with hydrophobic finish.', serviceMode: 'quote_required', pricingModel: 'from_price', fromPrice: 800, priceUnit: 'service' },
      { categoryKey: 'interior', name: 'Interior Detail', description: 'Vacuum, steam clean, and protect seats and surfaces.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 150, priceUnit: 'service' },
      { categoryKey: 'interior', name: 'Leather Conditioning', description: 'Clean and condition leather seats and trim.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 90, priceUnit: 'service' },
      { categoryKey: 'packages', name: 'Full Detail Package', description: 'Complete interior and exterior detail.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 280, priceUnit: 'service' },
    ],
    promptHints: 'Generate car wash and detailing services with package pricing.',
    websiteCopy: {
      uspItems: [
        { icon: '✦', label: 'Showroom finish', description: 'Professional detailing inside and out.' },
        { icon: '⚡', label: 'Paint protection', description: 'Wax, polish, and ceramic coating options.' },
        { icon: '♥', label: 'Careful attention', description: 'Hand-finished results for every vehicle.' },
      ],
      heroImageKeywords: ['car detailing polish', 'auto detailing interior clean'],
      ctaLabel: 'Book detail',
    },
  },
};
