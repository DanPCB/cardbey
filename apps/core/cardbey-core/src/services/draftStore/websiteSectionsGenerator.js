/**
 * Builds mini-website section payloads for draft preview (WebsitePreviewPage).
 * Shapes must match dashboard `WebsiteSection` types: hero, usp_bar, about, featured, social_proof, contact.
 */

/**
 * @param {string} storeType
 * @returns {'minimal'|'bold'|'editorial'|'warm'|'dark'}
 */
function templateIdForStoreType(storeType) {
  const t = (storeType || '').toString().toLowerCase().replace(/\s+/g, '_');
  if (/\b(florist|flower|garden)\b/.test(t) || t.includes('florist')) return 'editorial';
  if (/\b(salon|spa|nail|beauty|barber)\b/.test(t)) return 'minimal';
  if (/\b(retail|fashion|clothing|apparel|boutique)\b/.test(t)) return 'minimal';
  if (/\b(cafe|coffee|restaurant|bakery|bar|food)\b/.test(t)) return 'warm';
  return 'warm';
}

/** @param {{ id?: string, productId?: string } | null | undefined, index: number }} */
function stableItemKey(item, index) {
  if (!item || typeof item !== 'object') return `idx_${index}`;
  const id = item.id != null && String(item.id).trim() ? String(item.id).trim() : null;
  if (id) return id;
  const pid = item.productId != null && String(item.productId).trim() ? String(item.productId).trim() : null;
  if (pid) return pid;
  return `idx_${index}`;
}

/**
 * @param {object} preview - draft preview object (mutated: heroImageUrl, avatarUrl, website)
 * @param {object} [input] - draft.input
 */
export function mergeWebsiteIntoPreview(preview, input = {}) {
  if (!preview || typeof preview !== 'object') return;

  const heroUrl = preview.heroImageUrl ?? preview.hero?.imageUrl ?? preview.hero?.url ?? null;
  if (heroUrl && !preview.heroImageUrl) preview.heroImageUrl = heroUrl;

  const avUrl = preview.avatarUrl ?? preview.avatar?.imageUrl ?? preview.avatar?.url ?? null;
  if (avUrl && !preview.avatarUrl) preview.avatarUrl = avUrl;

  const storeName = preview.storeName || 'Your store';
  const storeType = preview.storeType || 'Store';
  const slogan = preview.slogan || preview.tagline || preview.heroText || '';
  const location = (input.location && String(input.location).trim()) || '';
  const blurb =
    (input.businessDescription && String(input.businessDescription).trim()) ||
    (input.prompt && String(input.prompt).trim()) ||
    (input.rawInput && String(input.rawInput).trim()) ||
    '';

  const items = Array.isArray(preview.items) ? preview.items : [];
  const featuredIds = items.slice(0, 4).map((it, i) => stableItemKey(it, i));

  const aboutBody =
    blurb ||
    `${storeName} is a ${storeType} dedicated to quality and a great customer experience.` +
      (location ? ` Visit us in ${location}.` : '');

  const firstItemImage = items.find((it) => it?.imageUrl)?.imageUrl ?? null;

  /** @type {Array<{ type: string, content: Record<string, unknown> }>} */
  const sections = [
    {
      type: 'hero',
      content: {
        headline: storeName,
        subheadline: slogan || `Welcome to ${storeName}`,
        ctaLabel: 'Shop now',
        ctaSecondary: 'Our story',
      },
    },
    {
      type: 'usp_bar',
      content: {
        items: [
          { icon: '✦', label: 'Curated quality', description: 'Hand-picked products you will love.' },
          { icon: '⚡', label: 'Fast service', description: 'A smooth experience from browse to checkout.' },
          { icon: '♥', label: 'Made for you', description: `${storeType} essentials with personality.` },
        ],
      },
    },
    {
      type: 'featured',
      content: {
        heading: 'Featured picks',
        productIds: featuredIds,
        layout: 'hero_left',
      },
    },
    {
      type: 'social_proof',
      content: {
        heading: 'What customers say',
        reviews: [
          { text: `Absolutely love ${storeName} — great selection and friendly vibe.`, author: 'Alex M.', rating: 5 },
          { text: 'Quality exceeded expectations. Will definitely come back!', author: 'Jordan K.', rating: 5 },
          { text: 'Easy to shop and beautiful presentation. Highly recommend.', author: 'Sam R.', rating: 4 },
        ],
      },
    },
    {
      type: 'about',
      content: {
        heading: 'Our story',
        body: aboutBody,
        imageUrl: firstItemImage || heroUrl || null,
      },
    },
    {
      type: 'contact',
      content: {
        heading: 'Visit us',
        address: location || null,
        hours: 'Open daily — hours on request',
        cta: 'Get directions',
      },
    },
  ];

  const templateId = templateIdForStoreType(storeType);
  preview.website = {
    ...(preview.website && typeof preview.website === 'object' ? preview.website : {}),
    sections,
    theme: {
      ...(preview.website?.theme && typeof preview.website.theme === 'object' ? preview.website.theme : {}),
      templateId,
    },
    generatedAt: new Date().toISOString(),
  };
}
