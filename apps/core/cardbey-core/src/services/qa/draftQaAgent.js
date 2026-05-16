/** Fashion/template keywords that should not appear in sweets/cafe catalogs */
export const FASHION_KEYWORDS = /\b(blouse|trousers|dress|denim|jacket|hoodie|wallet|watch|earrings|leggings|polo|shorts|accessories|sweater|handbag|boots|scarf|necklace|skirt|jumpsuit|coat)\b/i;

/** Sweets/cafe keywords – if business indicates these, products must not be fashion */
const SWEETS_CAFE_KEYWORDS = /\b(cake|cupcake|donut|pastry|dessert|cookie|brownie|ice cream|gelato|coffee|tea|croissant|muffin|slice|sweets|bakery|cafe|confectionery|chocolate|candy)\b/i;

function detectTemplateLeakage(items, businessType, storeName) {
  if (!Array.isArray(items) || items.length < 5) return false;
  const combined = `${(businessType || '')} ${(storeName || '')}`.toLowerCase();
  if (!SWEETS_CAFE_KEYWORDS.test(combined)) return false;
  const fashionHits = items.filter((i) => FASHION_KEYWORDS.test(i?.name || ''));
  const ratio = fashionHits.length / items.length;
  return ratio >= 0.2;
}

/**
 * Draft QA Agent - deterministic checks on draft preview.
 * Returns qaReport for persistence in draft.preview.meta.qaReport.
 *
 * @param {object} draft - DraftStore or { preview, input } with items/products
 * @param {{ logger?: (msg: string) => void }} opts
 * @returns {{ totalItems: number, itemsWithImages: number, itemsWithoutImages: number, hasHero: boolean, hasAvatar: boolean, score: number, issues: string[], issueCodes?: string[], computedAt: string }}
 */
export function runDraftQa(draft, opts = {}) {
  const logger = opts.logger || (() => {});
  const preview = draft?.preview && typeof draft.preview === 'object'
    ? draft.preview
    : typeof draft?.preview === 'string'
      ? (() => { try { return JSON.parse(draft.preview); } catch { return {}; } })()
      : {};

  const items = Array.isArray(preview.items)
    ? preview.items
    : Array.isArray(preview.catalog?.products)
      ? preview.catalog.products
      : [];

  const totalItems = items.length;
  const itemsWithImages = items.filter((i) => i && (i.imageUrl || i.images?.[0])).length;
  const itemsWithoutImages = totalItems - itemsWithImages;

  const heroUrl = preview?.hero?.imageUrl ?? preview?.heroImageUrl ?? preview?.hero?.url;
  const avatarUrl = preview?.avatar?.imageUrl ?? preview?.avatarImageUrl ?? preview?.avatar?.url ?? preview?.brand?.logoUrl;
  const hasHero = !!(heroUrl && String(heroUrl).trim());
  const hasAvatar = !!(avatarUrl && String(avatarUrl).trim());

  const input = draft?.input && typeof draft.input === 'object' ? draft.input : {};
  const businessType = input.businessType || input.storeType || preview.storeType || preview.meta?.storeType || '';
  const storeName = preview.storeName || preview.meta?.storeName || input.businessName || '';

  const issues = [];
  const issueCodes = [];
  if (detectTemplateLeakage(items, businessType, storeName)) {
    issues.push('TEMPLATE_CATALOG_LEAK: Template items detected. Click "Repair catalog" to fix.');
    issueCodes.push('TEMPLATE_CATALOG_LEAK');
  }
  if (totalItems > 0 && itemsWithoutImages > 0) {
    issues.push(`${itemsWithoutImages} product(s) missing images`);
  }
  if (!hasHero) issues.push('Missing hero image');
  if (!hasAvatar) issues.push('Missing avatar/logo');

  const lowConfidenceIds = items
    .filter((i) => i && typeof i.imageConfidence === 'number' && i.imageConfidence < 0.6)
    .map((i) => i.id)
    .filter(Boolean);
  if (lowConfidenceIds.length > 0) {
    issues.push(`Low confidence image (items: ${lowConfidenceIds.slice(0, 10).join(', ')}${lowConfidenceIds.length > 10 ? '...' : ''})`);
    issueCodes.push('LOW_IMAGE_CONFIDENCE');
  }

  const urlToIds = new Map();
  items.forEach((i) => {
    if (!i || !i.imageUrl) return;
    const url = String(i.imageUrl).trim();
    if (!url) return;
    const ids = urlToIds.get(url) || [];
    ids.push(i.id);
    urlToIds.set(url, ids);
  });
  const duplicateImageIds = [];
  urlToIds.forEach((ids) => {
    if (ids.length > 2) duplicateImageIds.push(...ids);
  });
  if (duplicateImageIds.length > 0) {
    issues.push(`Duplicate image used for >2 items (items: ${duplicateImageIds.slice(0, 10).join(', ')}${duplicateImageIds.length > 10 ? '...' : ''})`);
    issueCodes.push('DUPLICATE_IMAGE');
  }

  // Score 0-100: weight images (60%), hero (20%), avatar (20%)
  const imageScore = totalItems === 0 ? 100 : Math.round((itemsWithImages / totalItems) * 100);
  const heroScore = hasHero ? 100 : 0;
  const avatarScore = hasAvatar ? 100 : 0;
  const score = totalItems === 0 && hasHero && hasAvatar
    ? 100
    : totalItems === 0
      ? Math.round((heroScore * 0.5) + (avatarScore * 0.5))
      : Math.round((imageScore * 0.6) + (heroScore * 0.2) + (avatarScore * 0.2));

  const qaReport = {
    totalItems,
    itemsWithImages,
    itemsWithoutImages,
    hasHero,
    hasAvatar,
    score,
    issues,
    ...(issueCodes.length > 0 && { issueCodes }),
    computedAt: new Date().toISOString(),
  };

  logger(`[DraftQA] score=${score} items=${itemsWithImages}/${totalItems} hero=${hasHero} avatar=${hasAvatar}`);
  return qaReport;
}
