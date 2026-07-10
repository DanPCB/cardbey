/** @type {Record<string, import('../industryBlueprintRegistry.js').IndustryBlueprint>} */
export const PROFESSIONAL_BLUEPRINTS = {
  'services.accounting': {
    id: 'services.accounting',
    industry: 'professional',
    label: 'Accounting',
    verticalSlugs: ['services.accounting'],
    matchPatterns: [/\b(accountant|accounting|bookkeep|tax return|bas|payroll|financial advisor)\b/i],
    templateKey: 'professional_services',
    categories: [
      { key: 'tax', label: 'Tax & Compliance' },
      { key: 'business', label: 'Business Services' },
      { key: 'advisory', label: 'Advisory' },
      { key: 'consult', label: 'Consultations' },
    ],
    items: [
      { categoryKey: 'tax', name: 'Individual Tax Return', description: 'Prepare and lodge personal tax return.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 180, priceUnit: 'return' },
      { categoryKey: 'tax', name: 'Business Tax Return', description: 'Company, trust, or partnership tax return.', serviceMode: 'quote_required', pricingModel: 'from_price', fromPrice: 450, priceUnit: 'return' },
      { categoryKey: 'tax', name: 'BAS Lodgement', description: 'Prepare and lodge business activity statements.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 120, priceUnit: 'quarter' },
      { categoryKey: 'business', name: 'Bookkeeping (Monthly)', description: 'Reconcile accounts and prepare monthly reports.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 350, priceUnit: 'month' },
      { categoryKey: 'business', name: 'Payroll Processing', description: 'Weekly or fortnightly payroll with STP reporting.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 80, priceUnit: 'run' },
      { categoryKey: 'advisory', name: 'Business Advisory Session', description: '1-hour strategy session with a qualified advisor.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 250, priceUnit: 'hour', durationMinutes: 60 },
      { categoryKey: 'consult', name: 'Initial Consultation', description: 'Free 30-minute discovery call for new clients.', serviceMode: 'fixed_booking', pricingModel: 'fixed', basePrice: 0, durationMinutes: 30 },
    ],
    promptHints: 'Generate accounting and bookkeeping services with fixed and from-price professional fees.',
    websiteCopy: {
      uspItems: [
        { icon: '✦', label: 'Trusted advisors', description: 'Tax, bookkeeping, and business compliance.' },
        { icon: '⚡', label: 'Deadline ready', description: 'BAS, payroll, and tax returns handled on time.' },
        { icon: '♥', label: 'Clear advice', description: 'Plain-language guidance for your finances.' },
      ],
      heroImageKeywords: ['accounting office professional', 'financial advisor meeting'],
      ctaLabel: 'Book consultation',
    },
  },
  'services.legal': {
    id: 'services.legal',
    industry: 'professional',
    label: 'Legal Services',
    verticalSlugs: ['services.legal'],
    matchPatterns: [/\b(lawyer|legal|solicitor|conveyanc|litigation|family law|will|estate)\b/i],
    templateKey: 'professional_services',
    categories: [
      { key: 'property', label: 'Property & Conveyancing' },
      { key: 'family', label: 'Family Law' },
      { key: 'business', label: 'Business Law' },
      { key: 'consult', label: 'Consultations' },
    ],
    items: [
      { categoryKey: 'property', name: 'Conveyancing — Purchase', description: 'Legal review and settlement for property purchase.', serviceMode: 'quote_required', pricingModel: 'from_price', fromPrice: 1200, priceUnit: 'matter' },
      { categoryKey: 'property', name: 'Conveyancing — Sale', description: 'Contract preparation and settlement for property sale.', serviceMode: 'quote_required', pricingModel: 'from_price', fromPrice: 900, priceUnit: 'matter' },
      { categoryKey: 'family', name: 'Family Law Consultation', description: 'Initial advice on separation, parenting, or property.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 350, priceUnit: 'hour', durationMinutes: 60 },
      { categoryKey: 'family', name: 'Consent Orders', description: 'Draft and lodge consent orders for parenting/property.', serviceMode: 'quote_required', pricingModel: 'from_price', fromPrice: 2500, priceUnit: 'matter' },
      { categoryKey: 'business', name: 'Contract Review', description: 'Review commercial contracts with written advice.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 450, priceUnit: 'contract' },
      { categoryKey: 'business', name: 'Business Formation', description: 'Set up company or trust structure with documents.', serviceMode: 'quote_required', pricingModel: 'from_price', fromPrice: 1500, priceUnit: 'matter' },
      { categoryKey: 'consult', name: 'Initial Legal Consultation', description: '30-minute consultation to assess your matter.', serviceMode: 'fixed_booking', pricingModel: 'from_price', fromPrice: 180, priceUnit: 'consult', durationMinutes: 30 },
    ],
    promptHints: 'Generate legal services with matter-based and hourly professional pricing.',
    websiteCopy: {
      uspItems: [
        { icon: '✦', label: 'Experienced lawyers', description: 'Property, family, and business law expertise.' },
        { icon: '⚡', label: 'Clear process', description: 'Step-by-step guidance through your matter.' },
        { icon: '♥', label: 'Client focused', description: 'Practical advice with transparent fee estimates.' },
      ],
      heroImageKeywords: ['law office professional meeting', 'legal consultation'],
      ctaLabel: 'Book consultation',
    },
  },
};
