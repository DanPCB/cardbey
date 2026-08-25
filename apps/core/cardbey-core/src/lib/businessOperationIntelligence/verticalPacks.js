/**
 * Vertical intelligence packs — Phase D6.
 * Small set of operational archetypes. No invented industry statistics.
 */

export const VERTICAL_ARCHETYPES = Object.freeze({
  LOCAL_SERVICE: 'LOCAL_SERVICE',
  PROFESSIONAL_SERVICE: 'PROFESSIONAL_SERVICE',
  HOSPITALITY: 'HOSPITALITY',
  PRODUCT_RETAIL: 'PRODUCT_RETAIL',
  MANUFACTURING_B2B: 'MANUFACTURING_B2B',
  STARTUP_SERVICE: 'STARTUP_SERVICE',
  STARTUP_PRODUCT: 'STARTUP_PRODUCT',
  GENERAL: 'GENERAL',
});

/** @type {Record<string, object>} */
export const VERTICAL_PACKS = Object.freeze({
  [VERTICAL_ARCHETYPES.LOCAL_SERVICE]: {
    id: VERTICAL_ARCHETYPES.LOCAL_SERVICE,
    label: 'Local trade / home service',
    importantEvidence: ['offerings', 'location', 'service_area', 'contact_path', 'website'],
    capabilityPriorities: [
      'offering_definition',
      'service_area',
      'contact_quote_path',
      'digital_presence',
      'scheduling_ops',
      'customer_acquisition',
    ],
    competitorTokens: [
      'plumb',
      'electric',
      'detail',
      'clean',
      'garden',
      'door',
      'security',
      'install',
      'repair',
      'trade',
      'home',
      'mobile',
    ],
    rejectTokens: ['cafe', 'restaurant', 'sushi', 'boutique', 'fashion', 'nail', 'salon'],
  },
  [VERTICAL_ARCHETYPES.PROFESSIONAL_SERVICE]: {
    id: VERTICAL_ARCHETYPES.PROFESSIONAL_SERVICE,
    label: 'Professional / B2B service',
    importantEvidence: ['services', 'credentials_language', 'client_type', 'contact_path', 'location'],
    capabilityPriorities: [
      'service_definition',
      'client_segment',
      'trust_proof',
      'digital_presence',
      'sales_conversion',
      'compliance',
    ],
    competitorTokens: [
      'account',
      'tax',
      'legal',
      'law',
      'advisor',
      'consult',
      'clinic',
      'software',
      'ai',
      'bookkeep',
    ],
    rejectTokens: ['cafe', 'restaurant', 'nail', 'plumb', 'fashion', 'boutique'],
  },
  [VERTICAL_ARCHETYPES.HOSPITALITY]: {
    id: VERTICAL_ARCHETYPES.HOSPITALITY,
    label: 'Restaurant / hospitality',
    importantEvidence: ['menu', 'location', 'hours_language', 'booking_path', 'social', 'photos'],
    capabilityPriorities: [
      'menu_definition',
      'location_experience',
      'booking_or_order_path',
      'digital_presence',
      'operations',
      'customer_acquisition',
    ],
    competitorTokens: [
      'restaurant',
      'cafe',
      'pho',
      'vietnamese',
      'thai',
      'sushi',
      'kitchen',
      'bistro',
      'food',
      'dining',
      'bar',
    ],
    rejectTokens: ['plumb', 'legal', 'accounting', 'packaging', 'wholesale', 'door'],
  },
  [VERTICAL_ARCHETYPES.PRODUCT_RETAIL]: {
    id: VERTICAL_ARCHETYPES.PRODUCT_RETAIL,
    label: 'Product / retail',
    importantEvidence: ['product_catalogue', 'pricing_language', 'media', 'fulfil_or_storefront', 'location'],
    capabilityPriorities: [
      'product_catalogue',
      'brand_identity',
      'sales_channel',
      'fulfillment',
      'payments',
      'customer_acquisition',
    ],
    competitorTokens: [
      'retail',
      'boutique',
      'shop',
      'store',
      'fashion',
      'apparel',
      'gear',
      'outdoor',
      'coffee',
      'product',
    ],
    rejectTokens: ['plumb', 'legal', 'restaurant', 'freight', 'logistics'],
  },
  [VERTICAL_ARCHETYPES.MANUFACTURING_B2B]: {
    id: VERTICAL_ARCHETYPES.MANUFACTURING_B2B,
    label: 'Manufacturing / B2B supplier',
    importantEvidence: [
      'product_range',
      'customization',
      'moq_language',
      'lead_time',
      'enquiry',
      'export_language',
      'location',
    ],
    capabilityPriorities: [
      'product_range',
      'buyer_qualification_data',
      'enquiry_path',
      'operations',
      'supplier_inputs',
      'compliance',
      'digital_presence',
    ],
    competitorTokens: [
      'manufactur',
      'packaging',
      'suppl',
      'wholesale',
      'industrial',
      'factory',
      'print',
      'freight',
      'logistic',
      'export',
      'import',
      'trade',
    ],
    rejectTokens: ['cafe', 'restaurant', 'nail', 'boutique', 'salon', 'sushi'],
  },
  [VERTICAL_ARCHETYPES.STARTUP_SERVICE]: {
    id: VERTICAL_ARCHETYPES.STARTUP_SERVICE,
    label: 'Intended service startup',
    importantEvidence: ['concept', 'customer', 'operating_model', 'location', 'capabilities'],
    capabilityPriorities: [
      'offering_definition',
      'customer_validation',
      'operating_model',
      'digital_presence',
      'acquisition',
      'operations',
      'payments',
    ],
    competitorTokens: [],
    rejectTokens: [],
  },
  [VERTICAL_ARCHETYPES.STARTUP_PRODUCT]: {
    id: VERTICAL_ARCHETYPES.STARTUP_PRODUCT,
    label: 'Intended product startup',
    importantEvidence: ['concept', 'product', 'channel', 'supplier', 'location'],
    capabilityPriorities: [
      'product_definition',
      'customer_validation',
      'channel',
      'supplier_resource',
      'brand',
      'payments',
      'fulfillment',
    ],
    competitorTokens: [],
    rejectTokens: [],
  },
  [VERTICAL_ARCHETYPES.GENERAL]: {
    id: VERTICAL_ARCHETYPES.GENERAL,
    label: 'General business',
    importantEvidence: ['identity', 'offerings', 'location', 'digital_presence'],
    capabilityPriorities: [
      'identity',
      'offering_definition',
      'digital_presence',
      'customer_acquisition',
      'operations',
    ],
    competitorTokens: [],
    rejectTokens: [],
  },
});

/**
 * Resolve archetype from context + snapshot (deterministic).
 * @param {{ context?: object, snapshot?: object | null, mode?: string }} input
 */
export function resolveVerticalArchetype(input = {}) {
  const mode = input.mode || input.context?.mode || input.snapshot?.mode;
  const corpus = [
    input.context?.identity?.name,
    input.context?.identity?.businessType,
    input.context?.identity?.category,
    input.context?.identity?.operatingModel,
    input.context?.sourceText,
    input.snapshot?.identity?.name?.value,
    input.snapshot?.identity?.businessType?.value,
    input.snapshot?.identity?.category?.value,
    input.snapshot?.identity?.operatingModel?.value,
    input.snapshot?.digitalPresence?.description,
    ...(input.snapshot?.offerings?.items || []).map((i) => i.name),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (mode === 'INTENDED') {
    if (
      /\b(product|retail|packaging|manufactur|export|import|merchandise|gear|coffee)\b/.test(corpus)
    ) {
      return VERTICAL_PACKS[VERTICAL_ARCHETYPES.STARTUP_PRODUCT];
    }
    return VERTICAL_PACKS[VERTICAL_ARCHETYPES.STARTUP_SERVICE];
  }

  if (/\b(restaurant|cafe|pho|menu|bistro|dining|hospitality|vietnamese food)\b/.test(corpus)) {
    return VERTICAL_PACKS[VERTICAL_ARCHETYPES.HOSPITALITY];
  }
  if (
    /\b(manufactur|packaging|wholesale|supplier|freight|logistic|export|import|industrial|moq)\b/.test(
      corpus,
    )
  ) {
    return VERTICAL_PACKS[VERTICAL_ARCHETYPES.MANUFACTURING_B2B];
  }
  if (/\b(boutique|retail|fashion|apparel|shop|store|outdoor gear)\b/.test(corpus)) {
    return VERTICAL_PACKS[VERTICAL_ARCHETYPES.PRODUCT_RETAIL];
  }
  if (
    /\b(account|legal|law|tax|advisor|consult|clinic|software|ai scheduling|bookkeep)\b/.test(corpus)
  ) {
    return VERTICAL_PACKS[VERTICAL_ARCHETYPES.PROFESSIONAL_SERVICE];
  }
  if (
    /\b(plumb|electric|detail|clean|garden|door|security|install|repair|mobile|trade|home service)\b/.test(
      corpus,
    )
  ) {
    return VERTICAL_PACKS[VERTICAL_ARCHETYPES.LOCAL_SERVICE];
  }

  return VERTICAL_PACKS[VERTICAL_ARCHETYPES.GENERAL];
}

export function getVerticalPack(id) {
  return VERTICAL_PACKS[id] || VERTICAL_PACKS[VERTICAL_ARCHETYPES.GENERAL];
}
