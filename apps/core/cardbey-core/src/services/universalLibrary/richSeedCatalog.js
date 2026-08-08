/**
 * Phase 2F rich pilot catalogue — curated metadata across business ecosystems.
 * Generates ~600–800 canonical asset definitions (no external media binaries).
 * Idempotent via unique title + seedKey in metadata.
 */

import {
  ASSET_PROVIDER,
  ASSET_TYPE,
} from './universalAssetTypes.js';
import { CATALOGUE_QUALITY, CONTENT_ORIGIN } from './contentOrigin.js';

/** @type {ReadonlyArray<{ slug: string, name: string, subs: string[] }>} */
export const INDUSTRIES = Object.freeze([
  { slug: 'bakery', name: 'Bakery', subs: ['pastry', 'bread', 'cakes'] },
  { slug: 'cafe', name: 'Café', subs: ['espresso', 'brunch', 'coworking'] },
  { slug: 'restaurant', name: 'Restaurant', subs: ['fine-dining', 'casual', 'takeaway'] },
  { slug: 'beauty', name: 'Beauty', subs: ['skincare', 'nails', 'spa'] },
  { slug: 'hair', name: 'Hair', subs: ['salon', 'barber', 'color'] },
  { slug: 'fitness', name: 'Fitness', subs: ['gym', 'yoga', 'pt'] },
  { slug: 'fashion', name: 'Fashion', subs: ['boutique', 'streetwear', 'bridal'] },
  { slug: 'retail', name: 'Retail', subs: ['general', 'electronics', 'gift'] },
  { slug: 'home-services', name: 'Home Services', subs: ['cleaning', 'plumbing', 'gardening'] },
  { slug: 'education', name: 'Education', subs: ['tutoring', 'courses', 'kids'] },
  { slug: 'travel', name: 'Travel', subs: ['tours', 'hotel', 'local'] },
  { slug: 'automotive', name: 'Automotive', subs: ['workshop', 'detailing', 'dealership'] },
  { slug: 'pet-services', name: 'Pet Services', subs: ['grooming', 'vet', 'boarding'] },
  { slug: 'real-estate', name: 'Real Estate', subs: ['residential', 'commercial', 'rental'] },
]);

/**
 * Asset roles mapped to canonical types + presentation labels.
 * @type {ReadonlyArray<{ role: string, type: string, label: string, tags: string[] }>}
 */
export const ASSET_ROLES = Object.freeze([
  { role: 'video', type: ASSET_TYPE.VIDEO, label: 'Video', tags: ['video', 'promo'] },
  { role: 'image', type: ASSET_TYPE.IMAGE, label: 'Photo', tags: ['photo', 'hero'] },
  { role: 'logo', type: ASSET_TYPE.IMAGE, label: 'Logo', tags: ['logo', 'brand'] },
  { role: 'icon', type: ASSET_TYPE.IMAGE, label: 'Icon', tags: ['icon', 'ui'] },
  { role: 'template', type: ASSET_TYPE.TEMPLATE, label: 'Template', tags: ['template', 'storefront'] },
  { role: 'background', type: ASSET_TYPE.IMAGE, label: 'Background', tags: ['background', 'ambiance'] },
  { role: 'music', type: ASSET_TYPE.AUDIO, label: 'Music', tags: ['music', 'ambient'] },
  { role: 'article', type: ASSET_TYPE.ARTICLE, label: 'Article', tags: ['article', 'editorial'] },
  { role: 'guide', type: ASSET_TYPE.ARTICLE, label: 'Guide', tags: ['guide', 'howto'] },
  { role: 'promo', type: ASSET_TYPE.IMAGE, label: 'Promo Graphic', tags: ['promo', 'social'] },
  { role: 'qr', type: ASSET_TYPE.IMAGE, label: 'QR Asset', tags: ['qr', 'scan'] },
  { role: 'packaging', type: ASSET_TYPE.IMAGE, label: 'Packaging', tags: ['packaging', 'product'] },
  { role: 'storefront', type: ASSET_TYPE.TEMPLATE, label: 'Storefront', tags: ['storefront', 'website'] },
  { role: 'menu', type: ASSET_TYPE.DOCUMENT, label: 'Menu', tags: ['menu', 'catalog'] },
  { role: 'business-card', type: ASSET_TYPE.IMAGE, label: 'Business Card', tags: ['business-card', 'print'] },
  { role: 'social-post', type: ASSET_TYPE.IMAGE, label: 'Social Post', tags: ['social', 'instagram'] },
  { role: 'animation', type: ASSET_TYPE.VIDEO, label: 'Animation', tags: ['animation', 'motion'] },
  { role: 'document', type: ASSET_TYPE.DOCUMENT, label: 'Document', tags: ['document', 'checklist'] },
]);

/** Curated collection definitions (reference seedKeys after catalog build). */
export const COLLECTION_DEFS = Object.freeze([
  { slug: 'new-businesses', name: 'New Businesses', description: 'Starter assets for newly launched stores.' },
  { slug: 'popular-bakery', name: 'Popular Bakery Assets', description: 'High-utility bakery visuals and templates.' },
  { slug: 'french-cafe-kit', name: 'French Café Kit', description: 'Cohesive café brand + menu + ambience pack.' },
  { slug: 'minimal-storefront', name: 'Minimal Storefront', description: 'Clean templates and heroes for minimal sellers.' },
  { slug: 'summer-promo', name: 'Summer Promotion Pack', description: 'Seasonal promo graphics and social posts.' },
  { slug: 'restaurant-starter', name: 'Restaurant Starter Pack', description: 'Menus, heroes, and launch guides.' },
  { slug: 'top-creator-videos', name: 'Top Creator Videos', description: 'Creator-attributed video samples.' },
  { slug: 'cardbey-originals', name: 'Cardbey Originals', description: 'First-party Cardbey internal catalogue.' },
  { slug: 'open-license-picks', name: 'Open License Picks', description: 'Cleared open / internal reuse assets.' },
]);

const THUMB_BY_INDUSTRY = Object.freeze({
  bakery: '/assets/template-preview/restaurant-cafe-website.jpg',
  cafe: '/assets/template-preview/restaurant-cafe-website.jpg',
  restaurant: '/assets/template-preview/restaurant-cafe-website.jpg',
  retail: '/assets/template-preview/retail-store-website.jpg',
  fashion: '/assets/template-preview/retail-store-website.jpg',
  beauty: '/assets/template-preview/minimal-seller-storefront.jpg',
  hair: '/assets/template-preview/minimal-seller-storefront.jpg',
  fitness: '/assets/template-preview/minimal-seller-storefront.jpg',
  default: '/assets/template-preview/minimal-seller-storefront.jpg',
});

const CREATOR_POOL = Object.freeze([
  { id: 'creator_cardbey_studio', label: 'Cardbey Studio', verified: true },
  { id: 'creator_atelier_north', label: 'Atelier North', verified: true },
  { id: 'creator_signal_media', label: 'Signal Media', verified: false },
  { id: 'creator_local_lens', label: 'Local Lens', verified: false },
  { id: 'creator_orbit_design', label: 'Orbit Design', verified: true },
]);

/**
 * Build the full rich pilot catalogue definitions.
 * @param {{ targetMin?: number, targetMax?: number }} [opts]
 */
export function buildRichSeedCatalog(opts = {}) {
  const targetMin = Number(opts.targetMin) || 500;
  const targetMax = Number(opts.targetMax) || 1000;
  /** @type {object[]} */
  const entries = [];

  // Anchor classics (backward compatible with early pilot titles).
  const anchors = [
    {
      key: 'seed-hero-retail',
      title: 'Retail Storefront Hero',
      type: ASSET_TYPE.IMAGE,
      industry: 'retail',
      role: 'image',
      provider: ASSET_PROVIDER.SEED,
    },
    {
      key: 'seed-hero-restaurant',
      title: 'Restaurant & Cafe Hero',
      type: ASSET_TYPE.IMAGE,
      industry: 'restaurant',
      role: 'image',
      provider: ASSET_PROVIDER.SEED,
    },
    {
      key: 'seed-template-minimal',
      title: 'Minimal Seller Storefront Template',
      type: ASSET_TYPE.TEMPLATE,
      industry: 'retail',
      role: 'storefront',
      provider: ASSET_PROVIDER.CARDBEY_INTERNAL,
    },
    {
      key: 'seed-audio-ambient',
      title: 'Ambient Store Background',
      type: ASSET_TYPE.AUDIO,
      industry: 'retail',
      role: 'music',
      provider: ASSET_PROVIDER.CARDBEY_INTERNAL,
    },
    {
      key: 'seed-article-launch',
      title: 'Launch Your Digital Store',
      type: ASSET_TYPE.ARTICLE,
      industry: 'education',
      role: 'guide',
      provider: ASSET_PROVIDER.CARDBEY_INTERNAL,
    },
  ];

  for (const a of anchors) {
    entries.push(toEntry(a.industry, a.role, 1, a));
  }

  const variants = ['Classic', 'Modern', 'Bold', 'Soft'];
  for (const industry of INDUSTRIES) {
    for (const role of ASSET_ROLES) {
      for (let v = 0; v < variants.length; v += 1) {
        if (entries.length >= targetMax) break;
        const sub = industry.subs[v % industry.subs.length];
        const key = `seed-${industry.slug}-${role.role}-v${v + 1}`;
        entries.push(
          toEntry(industry.slug, role.role, v + 1, {
            key,
            title: `${industry.name} ${role.label} — ${variants[v]} (${sub})`,
            type: role.type,
            provider: v % 3 === 0 ? ASSET_PROVIDER.CARDBEY_INTERNAL : ASSET_PROVIDER.SEED,
            sub,
          }),
        );
      }
    }
  }

  // Trim evenly if somehow over; ensure minimum by expanding education docs.
  while (entries.length < targetMin) {
    const n = entries.length + 1;
    entries.push(
      toEntry('education', 'guide', n, {
        key: `seed-education-guide-extra-${n}`,
        title: `Business Capability Guide #${n}`,
        type: ASSET_TYPE.ARTICLE,
        provider: ASSET_PROVIDER.CARDBEY_INTERNAL,
      }),
    );
  }

  return Object.freeze(entries.slice(0, targetMax));
}

/**
 * @param {string} industrySlug
 * @param {string} role
 * @param {number} variant
 * @param {object} override
 */
function toEntry(industrySlug, role, variant, override = {}) {
  const industry = INDUSTRIES.find((i) => i.slug === industrySlug) || INDUSTRIES[0];
  const roleDef = ASSET_ROLES.find((r) => r.role === role) || ASSET_ROLES[0];
  const creator = CREATOR_POOL[(variant + industrySlug.length) % CREATOR_POOL.length];
  const premium = variant === 4;
  const key = override.key || `seed-${industry.slug}-${roleDef.role}-v${variant}`;
  const title =
    override.title || `${industry.name} ${roleDef.label} — Variant ${variant}`;

  return {
    key,
    title,
    description:
      override.description ||
      `${roleDef.label} for ${industry.name.toLowerCase()} businesses. Curated Cardbey pilot asset (metadata catalogue).`,
    type: override.type || roleDef.type,
    provider: override.provider || ASSET_PROVIDER.SEED,
    categories: ['bakery', 'cafe', 'restaurant'].includes(industry.slug)
      ? ['food-drink', industry.slug]
      : [industry.slug],
    tags: [...roleDef.tags, industry.slug, override.sub].filter(Boolean),
    license: premium ? 'cardbey-premium-pending' : 'cardbey-internal',
    qualityScore: 60 + ((variant * 7 + industrySlug.length) % 35),
    thumbnail: THUMB_BY_INDUSTRY[industry.slug] || THUMB_BY_INDUSTRY.default,
    creatorId: creator.id,
    metadata: {
      seedKey: key,
      industry: industry.slug,
      industryName: industry.name,
      assetRole: roleDef.role,
      assetRoleLabel: roleDef.label,
      subCategory: override.sub || industry.subs[0],
      contentOrigin: CONTENT_ORIGIN.DEVELOPMENT_FIXTURE,
      catalogueQualityStatus: CATALOGUE_QUALITY.FIXTURE_ONLY,
      syntheticEngagement: true,
      fixtureLabel: 'Development fixture',
      // Fixtures must never appear as product premium / verified engagement
      premium: false,
      openLicense: true,
      creatorLabel: creator.label,
      creatorVerified: false,
      useCases: [`${industry.name} marketing`, `${roleDef.label} reuse`],
      views: 0,
      downloads: 0,
      rating: null,
      _devOnlyVariantPremium: premium,
    },
  };
}

/** Prebuilt frozen catalogue for import-time consumers. */
export const RICH_SEED_CATALOG = buildRichSeedCatalog({ targetMin: 560, targetMax: 720 });

export default RICH_SEED_CATALOG;
