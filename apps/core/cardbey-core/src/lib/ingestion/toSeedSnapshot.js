/**
 * Map an IngestedSeedRecord (or loose seed object) to a SeedSnapshot.
 * Never throws on null/missing relations.
 */

const HOSPITALITY = new Set([
  'food',
  'cafe',
  'coffee',
  'restaurant',
  'bar',
  'bakery',
  'hospitality',
  'pizza',
]);
const RETAIL = new Set(['retail', 'shop', 'store', 'market', 'boutique']);
const SERVICE = new Set([
  'service',
  'services',
  'beauty',
  'salon',
  'vet',
  'yoga',
  'fitness',
  'health',
  'professional',
]);

export function resolveBusinessType(category) {
  const key = String(category ?? '')
    .trim()
    .toLowerCase();
  if (!key) return 'unknown';
  if (HOSPITALITY.has(key) || key.includes('cafe') || key.includes('restaurant')) return 'hospitality';
  if (RETAIL.has(key) || key.includes('retail')) return 'retail';
  if (SERVICE.has(key) || key.includes('yoga') || key.includes('vet') || key.includes('beauty')) {
    return 'service';
  }
  return 'unknown';
}

function mapHeroProvenance(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (value === 'admin_curated' || value === 'website_extraction' || value === 'social_og' || value === 'stock_fallback') {
    return value;
  }
  if (value === 'owner_website_og_image' || value === 'og_image' || value === 'website') return 'website_extraction';
  if (value === 'social' || value === 'instagram_og') return 'social_og';
  if (value === 'stock' || value === 'pexels' || value === 'unsplash') return 'stock_fallback';
  return null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeUrl(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function logoSuspectFromUrl(url, visualSource) {
  const src = String(visualSource ?? '').toLowerCase();
  if (src === 'logodev' || src.includes('logo')) return true;
  const u = String(url ?? '').toLowerCase();
  return u.includes('logo') || u.endsWith('.svg');
}

/**
 * @param {object | null | undefined} seed
 */
export function toSeedSnapshot(seed) {
  const record = seed && typeof seed === 'object' ? seed : {};
  const normalized = record.normalized && typeof record.normalized === 'object' ? record.normalized : {};
  const enrichment =
    record.enrichmentProfile && typeof record.enrichmentProfile === 'object' ? record.enrichmentProfile : {};
  const heroMeta = record.hero && typeof record.hero === 'object' ? record.hero : {};

  const heroUrl = safeUrl(heroMeta.url) || safeUrl(enrichment.heroImageUrl);
  const visualSource = heroMeta.provenance ?? enrichment.visualSource ?? null;
  const provenance = mapHeroProvenance(visualSource);

  const itemsSource = asArray(record.items).length ? record.items : asArray(enrichment.items);
  const gallerySource = asArray(record.gallery).length ? record.gallery : asArray(enrichment.gallery);

  return {
    businessName: normalized.businessName ?? record.businessName ?? record.name ?? null,
    category: normalized.category ?? record.category ?? null,
    businessType: record.businessType ?? resolveBusinessType(normalized.category ?? record.category),
    address: normalized.address ?? record.address ?? null,
    hours: record.hours ?? enrichment.hours ?? null,
    tagline: record.tagline ?? enrichment.tagline ?? null,
    about: record.about ?? enrichment.description ?? enrichment.about ?? null,
    hero: heroUrl
      ? {
          url: heroUrl,
          width: heroMeta.width ?? enrichment.heroWidth ?? null,
          height: heroMeta.height ?? enrichment.heroHeight ?? null,
          provenance,
          isLogoSuspect:
            typeof heroMeta.isLogoSuspect === 'boolean'
              ? heroMeta.isLogoSuspect
              : logoSuspectFromUrl(heroUrl, visualSource),
        }
      : null,
    gallery: gallerySource.map((img) =>
      typeof img === 'string'
        ? { url: img, width: null, height: null, provenance: null }
        : {
            url: img?.url ?? null,
            width: img?.width ?? null,
            height: img?.height ?? null,
            provenance: mapHeroProvenance(img?.provenance) ?? img?.provenance ?? null,
          },
    ),
    items: itemsSource.map((item) => ({
      name: item?.name ?? item?.title ?? null,
      description: item?.description ?? null,
      price: typeof item?.price === 'number' ? item.price : null,
      itemType: item?.itemType === 'service' ? 'service' : 'product',
      provenance: item?.provenance ?? 'unknown',
    })),
    socialLinks: record.socialLinks ?? enrichment.socialLinks ?? null,
  };
}
