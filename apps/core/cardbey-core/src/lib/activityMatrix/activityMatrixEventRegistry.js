/**
 * Central registry for User Activity Matrix events.
 * Maps user-facing keys to StoreActivityEvent and PilEvent source types.
 */

/** @typedef {'hour' | 'day' | 'week' | 'month'} ActivityGranularity */
/** @typedef {'user' | 'customer' | 'seller' | 'owner' | 'anonymous'} ActorScope */

/**
 * @typedef {object} EventSource
 * @property {'storeActivity' | 'pil'} table
 * @property {string} eventType
 */

/**
 * @typedef {object} EventDefinition
 * @property {string} key
 * @property {string} label
 * @property {string} description
 * @property {string} category
 * @property {ActorScope} actorScope
 * @property {ActivityGranularity[]} supportedGranularities
 * @property {EventSource[]} sources
 * @property {'store' | 'platform' | 'both'} [dataScope]
 */

/** @type {EventDefinition[]} */
export const ACTIVITY_MATRIX_EVENT_DEFINITIONS = [
  {
    key: 'store_viewed',
    label: 'Store viewed',
    description: 'A visitor opened the store page.',
    category: 'engagement',
    actorScope: 'customer',
    supportedGranularities: ['hour', 'day', 'week', 'month'],
    sources: [{ table: 'storeActivity', eventType: 'STORE_VIEWED' }],
  },
  {
    key: 'offer_viewed',
    label: 'Offer viewed',
    description: 'A visitor viewed an offer.',
    category: 'engagement',
    actorScope: 'customer',
    supportedGranularities: ['hour', 'day', 'week', 'month'],
    sources: [{ table: 'storeActivity', eventType: 'OFFER_VIEWED' }],
  },
  {
    key: 'offer_claimed',
    label: 'Offer claimed',
    description: 'A visitor claimed an offer.',
    category: 'conversion',
    actorScope: 'customer',
    supportedGranularities: ['hour', 'day', 'week', 'month'],
    sources: [{ table: 'storeActivity', eventType: 'OFFER_CLAIMED' }],
  },
  {
    key: 'campaign_clicked',
    label: 'Campaign clicked',
    description: 'A visitor clicked a campaign link.',
    category: 'engagement',
    actorScope: 'customer',
    supportedGranularities: ['hour', 'day', 'week', 'month'],
    sources: [{ table: 'storeActivity', eventType: 'CAMPAIGN_CLICKED' }],
  },
  {
    key: 'qr_scanned',
    label: 'QR scanned',
    description: 'A visitor scanned a store QR code.',
    category: 'engagement',
    actorScope: 'customer',
    supportedGranularities: ['hour', 'day', 'week', 'month'],
    sources: [{ table: 'storeActivity', eventType: 'QR_SCANNED' }],
  },
  {
    key: 'order_clicked',
    label: 'Order clicked',
    description: 'A visitor clicked to place an order.',
    category: 'conversion',
    actorScope: 'customer',
    supportedGranularities: ['hour', 'day', 'week', 'month'],
    sources: [{ table: 'storeActivity', eventType: 'ORDER_CLICKED' }],
  },
  {
    key: 'store_followed',
    label: 'Store followed',
    description: 'A visitor followed the store.',
    category: 'engagement',
    actorScope: 'customer',
    supportedGranularities: ['day', 'week', 'month'],
    sources: [{ table: 'storeActivity', eventType: 'STORE_FOLLOWED' }],
  },
  {
    key: 'store_shared',
    label: 'Store shared',
    description: 'A visitor shared the store.',
    category: 'engagement',
    actorScope: 'customer',
    supportedGranularities: ['day', 'week', 'month'],
    sources: [{ table: 'storeActivity', eventType: 'STORE_SHARED' }],
  },
  {
    key: 'viewed_product',
    label: 'Product viewed',
    description: 'A visitor viewed a product (PIL).',
    category: 'commerce',
    actorScope: 'customer',
    supportedGranularities: ['hour', 'day', 'week', 'month'],
    sources: [{ table: 'pil', eventType: 'product_view' }],
  },
  {
    key: 'added_to_cart',
    label: 'Added to cart',
    description: 'A visitor added an item to cart (PIL).',
    category: 'commerce',
    actorScope: 'customer',
    supportedGranularities: ['hour', 'day', 'week', 'month'],
    sources: [{ table: 'pil', eventType: 'cart_add' }],
  },
  {
    key: 'opened_performer',
    label: 'Opened Performer',
    description: 'A user launched Performer from discover.',
    category: 'performer',
    actorScope: 'owner',
    supportedGranularities: ['hour', 'day', 'week', 'month'],
    sources: [{ table: 'pil', eventType: 'discover_performer_launch' }],
  },
  {
    key: 'store_open',
    label: 'Store opened',
    description: 'A visitor opened a store from feed or discover.',
    category: 'engagement',
    actorScope: 'customer',
    supportedGranularities: ['hour', 'day', 'week', 'month'],
    sources: [{ table: 'pil', eventType: 'store_open' }],
  },
  {
    key: 'feed_view',
    label: 'Feed viewed',
    description: 'A user viewed a card on the platform feed.',
    category: 'platform',
    actorScope: 'user',
    dataScope: 'platform',
    supportedGranularities: ['hour', 'day', 'week', 'month'],
    sources: [{ table: 'pil', eventType: 'feed_view' }],
  },
  {
    key: 'discover_open',
    label: 'Discover opened',
    description: 'A user opened a discover rail or result.',
    category: 'platform',
    actorScope: 'user',
    dataScope: 'platform',
    supportedGranularities: ['hour', 'day', 'week', 'month'],
    sources: [{ table: 'pil', eventType: 'discover_open' }],
  },
  {
    key: 'pil_capability_used',
    label: 'PIL capability used',
    description: 'A user interacted with a PIL capability.',
    category: 'platform',
    actorScope: 'user',
    dataScope: 'platform',
    supportedGranularities: ['day', 'week', 'month'],
    sources: [{ table: 'pil', eventType: 'pil_capability_used' }],
  },
];

const DEFINITION_BY_KEY = new Map(ACTIVITY_MATRIX_EVENT_DEFINITIONS.map((d) => [d.key, d]));

/** @param {string} key */
export function getEventDefinition(key) {
  return DEFINITION_BY_KEY.get(String(key ?? '').trim()) ?? null;
}

export function listEventDefinitions(scope = 'store') {
  const defs =
    scope === 'platform'
      ? ACTIVITY_MATRIX_EVENT_DEFINITIONS
      : ACTIVITY_MATRIX_EVENT_DEFINITIONS.filter((d) => (d.dataScope ?? 'store') !== 'platform');
  return defs.map((d) => ({
    key: d.key,
    label: d.label,
    description: d.description,
    category: d.category,
    actorScope: d.actorScope,
    supportedGranularities: d.supportedGranularities,
    dataScope: d.dataScope ?? 'store',
  }));
}

/**
 * Resolve source event types for one or more matrix event keys.
 * @param {string[]} keys
 */
export function resolveEventSources(keys) {
  const storeActivityTypes = new Set();
  const pilTypes = new Set();
  for (const key of keys) {
    const def = getEventDefinition(key);
    if (!def) continue;
    for (const src of def.sources) {
      if (src.table === 'storeActivity') storeActivityTypes.add(src.eventType);
      if (src.table === 'pil') pilTypes.add(src.eventType);
    }
  }
  return { storeActivityTypes: [...storeActivityTypes], pilTypes: [...pilTypes] };
}

/**
 * Map a raw DB event back to matrix key(s).
 * @param {'storeActivity' | 'pil'} table
 * @param {string} eventType
 * @param {string[]} selectedKeys
 */
export function matrixKeyForSourceEvent(table, eventType, selectedKeys) {
  const keys = selectedKeys.length > 0 ? selectedKeys : ACTIVITY_MATRIX_EVENT_DEFINITIONS.map((d) => d.key);
  for (const key of keys) {
    const def = getEventDefinition(key);
    if (!def) continue;
    if (def.sources.some((s) => s.table === table && s.eventType === eventType)) return key;
  }
  return null;
}
