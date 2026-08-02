/**
 * Resolve projection itemRefs → renderer items (no reclassification / no invented facts).
 */

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   description?: string,
 *   href?: string,
 *   contentRole: string,
 *   contentOrigin: string,
 *   requiresOwnerReview: boolean,
 *   price?: unknown,
 *   purchaseEnabled: boolean,
 *   bookingEnabled: boolean,
 *   groupKey?: string | null,
 *   metadata?: Record<string, unknown>,
 * }} RenderItem
 */

/**
 * @param {string[]} itemRefs
 * @param {unknown[]} catalogItems
 * @returns {{ items: RenderItem[], unresolved: string[] }}
 */
export function resolveProjectionItems(itemRefs, catalogItems = []) {
  const list = Array.isArray(catalogItems) ? catalogItems : [];
  /** @type {Map<string, { item: Record<string, unknown>, index: number }>} */
  const byRef = new Map();

  list.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const item = /** @type {Record<string, unknown>} */ (raw);
    for (const ref of candidateRefs(item, index)) {
      if (!byRef.has(ref)) byRef.set(ref, { item, index });
    }
  });

  /** @type {RenderItem[]} */
  const items = [];
  /** @type {string[]} */
  const unresolved = [];

  for (const ref of itemRefs ?? []) {
    const hit = byRef.get(String(ref));
    if (!hit) {
      unresolved.push(String(ref));
      continue;
    }
    items.push(toRenderItem(hit.item, String(ref)));
  }

  return { items: Object.freeze(items.map(freezeItem)), unresolved };
}

/**
 * @param {Record<string, unknown>} item
 * @param {number} index
 */
function candidateRefs(item, index) {
  /** @type {string[]} */
  const refs = [];
  if (item.id != null && String(item.id).trim()) refs.push(String(item.id).trim());
  if (item.sku != null && String(item.sku).trim()) refs.push(`sku:${String(item.sku).trim()}`);
  const url = String(item.url ?? item.sourceUrl ?? '').trim();
  if (url) refs.push(`url:${url}`);
  const name = String(item.name ?? item.title ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  if (name) refs.push(`name:${name}:${index}`);
  refs.push(`item:${index}`);
  return refs;
}

/**
 * @param {Record<string, unknown>} item
 * @param {string} ref
 * @returns {RenderItem}
 */
function toRenderItem(item, ref) {
  const contentRole = String(item.contentRole ?? 'unknown');
  const purchaseEnabled =
    item.purchaseEnabled === true &&
    item.price != null &&
    item.price !== '' &&
    item.priceWasNotExplicitlyProvided !== true;
  const bookingEnabled = item.bookingEnabled === true;

  return {
    id: ref,
    title: String(item.name ?? item.title ?? '').trim() || ref,
    description: item.description != null ? String(item.description) : undefined,
    href: item.url != null ? String(item.url) : item.sourceUrl != null ? String(item.sourceUrl) : undefined,
    contentRole,
    contentOrigin: String(item.contentOrigin ?? 'sourced'),
    requiresOwnerReview: Boolean(item.needsOwnerReview),
    price: purchaseEnabled ? item.price : undefined,
    purchaseEnabled,
    bookingEnabled: bookingEnabled && !purchaseEnabled,
    groupKey: item.categoryGroup != null ? String(item.categoryGroup) : null,
    metadata: Object.freeze({
      // Never promote policy/career/testimonial/trust into commerce semantics
      isCommerceItem: ['product', 'service', 'menu_item'].includes(contentRole),
    }),
  };
}

/** @param {RenderItem} item */
function freezeItem(item) {
  return Object.freeze({
    ...item,
    ...(item.metadata ? { metadata: Object.freeze({ ...item.metadata }) } : {}),
  });
}

/**
 * Forbidden: commerce mapping for non-offering roles.
 * @param {RenderItem} item
 */
export function assertNonCommerceRole(item) {
  const forbidden = new Set(['policy', 'career', 'testimonial', 'trust_content', 'navigation']);
  if (forbidden.has(item.contentRole) && (item.purchaseEnabled || item.bookingEnabled)) {
    return false;
  }
  return true;
}
