/**
 * buildSKP — constructs Store Knowledge Projection from available sources.
 * Read-only: never writes Business / User / seed tables.
 */

import {
  ProvenanceTag,
  withProvenance,
  defaultOwnerishProvenance,
  mapMission001StatusToSkp,
  mapBoiKnowledgeStateToSkp,
} from './provenance.js';
import { SKP_VERSION, resolveSkpVisibilityFlags } from './StoreKnowledgeProjection.js';
import { publicCanonicalWebBase, buildPublicStorefrontPath } from '../../utils/publicWebBase.js';
import { isPublicFeedEligibleBusiness } from '../../utils/publicStoreVisibility.js';
import { Features } from '../../config/features.js';

function str(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function asObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

function parseMaybeJson(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function resolveLogo(business) {
  let avatar = str(business?.avatarImageUrl);
  let banner = str(business?.heroImageUrl);
  const logo = business?.logo;
  if (!logo) return { avatar, banner };
  try {
    const parsed = typeof logo === 'string' ? JSON.parse(logo) : logo;
    if (parsed && typeof parsed === 'object') {
      avatar = avatar || str(parsed.avatarUrl || parsed.url);
      banner = banner || str(parsed.heroUrl || parsed.coverUrl || parsed.bannerUrl);
    } else if (typeof logo === 'string' && /^https?:\/\//i.test(logo.trim())) {
      avatar = avatar || logo.trim();
    }
  } catch {
    if (typeof logo === 'string' && logo.trim()) avatar = avatar || logo.trim();
  }
  return { avatar, banner };
}

function socialLinksOf(business) {
  const raw = parseMaybeJson(business?.socialLinks) || business?.socialLinks;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const s = str(v);
    if (s) out[k] = s;
  }
  return out;
}

function canonicalForSlug(slug, storeId) {
  const path = buildPublicStorefrontPath(slug) || `/s/${encodeURIComponent(slug || storeId || '')}`;
  const base = publicCanonicalWebBase();
  if (/^https?:\/\//i.test(path)) return path;
  return `${String(base).replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Pure builder from already-loaded sources.
 * @param {{ business: object, artifact?: object|null, boiSnapshot?: object|null, mission001?: object|null }} sources
 */
export function buildSKPFromSources(sources = {}) {
  const business = sources.business;
  if (!business || typeof business !== 'object') return null;
  if (!business.publishedAt) return null;
  if (business.isActive === false) return null;

  const artifact =
    asObj(sources.artifact) || asObj(sources.artifact?.projectionJson) || null;
  const content = asObj(artifact?.content) || {};
  const hero = asObj(artifact?.hero) || {};
  const commerce = asObj(artifact?.commerce) || {};
  const products = Array.isArray(commerce.products)
    ? commerce.products
    : Array.isArray(business.products)
      ? business.products
      : [];

  const ownerTag = defaultOwnerishProvenance(business);
  const ownerConfirmed = ownerTag === ProvenanceTag.SELLER_CONFIRMED;
  const slug = str(business.slug) || str(artifact?.slug) || String(business.id);
  const { avatar, banner } = resolveLogo(business);

  const nameValue = str(business.name) || str(artifact?.name) || 'Untitled store';
  const descriptionValue =
    str(business.description) || str(content.description) || str(content.shortDescription);
  const taglineValue = str(business.tagline) || str(content.tagline) || str(business.heroText);

  const suburbValue = str(business.suburb) || str(business.city);
  const stateValue = str(business.state);
  const countryValue = str(business.country) || 'AU';
  const addressValue = str(business.formattedAddress) || str(business.address);

  const lat = Number(business.lat);
  const lng = Number(business.lng);
  const coords =
    Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

  const categoryValue = str(artifact?.category) || str(business.type) || 'Other';
  const heroImageValue =
    str(hero.imageUrl) || str(hero.posterUrl) || banner || str(business.heroImageUrl);
  const heroVideoValue = str(hero.videoUrl) || str(artifact?.heroVideoUrl);

  const phoneValue = str(business.phone);
  const emailValue = str(business.email);
  const websiteValue = str(business.websiteUrl);

  const boi = asObj(sources.boiSnapshot);
  let biSummaryValue = null;
  let biProv = ProvenanceTag.UNVERIFIED;
  let biSource;
  let biConf = 0.5;
  if (boi) {
    const summaryField = boi.biSummary || boi.summary || boi.narrative;
    if (summaryField && typeof summaryField === 'object' && 'value' in summaryField) {
      biSummaryValue = str(summaryField.value);
      biProv = mapBoiKnowledgeStateToSkp(summaryField.knowledgeState);
      biSource = summaryField.source || 'boi_snapshot';
      biConf = Number(summaryField.confidence ?? 0.7);
    } else if (typeof summaryField === 'string') {
      biSummaryValue = str(summaryField);
      biProv = ProvenanceTag.AI_INFERRED;
      biSource = 'boi_snapshot';
      biConf = 0.65;
    }
  }
  if (!biSummaryValue && descriptionValue) {
    biSummaryValue = descriptionValue;
    biProv = ownerConfirmed ? ProvenanceTag.SELLER_CONFIRMED : ProvenanceTag.AI_INFERRED;
    biSource = 'store_description';
    biConf = ownerConfirmed ? 0.9 : 0.6;
  }

  const mission = asObj(sources.mission001);
  const insights = Array.isArray(mission?.insights)
    ? mission.insights.map((x) => String(x)).filter(Boolean)
    : [];
  const insightProv = mapMission001StatusToSkp(mission?.catalogProvenanceSummary, {
    ownerConfirmed,
  });

  const enrichmentSources = [];
  if (artifact) enrichmentSources.push('published_artifact');
  if (boi) enrichmentSources.push('boi_snapshot');
  if (mission) enrichmentSources.push('mission_001');
  if (str(business.locationSource)) enrichmentSources.push(String(business.locationSource));

  let enrichmentStatus = 'UNENRICHED';
  if (descriptionValue && categoryValue && categoryValue !== 'Other' && suburbValue) {
    enrichmentStatus = 'ENRICHED';
  } else if (descriptionValue || products.length > 0) {
    enrichmentStatus = 'PARTIAL';
  }

  const canonicalUrl = canonicalForSlug(slug, business.id);
  let indexable = Boolean(business.publishedAt) && business.isActive !== false;
  try {
    if (!isPublicFeedEligibleBusiness(business)) indexable = false;
  } catch {
    /* keep */
  }

  const jsonLdReady = Boolean(
    nameValue && descriptionValue && categoryValue && categoryValue !== 'Other',
  );
  const visFlags = resolveSkpVisibilityFlags({
    indexable,
    jsonLdReady,
    attributionEnabled: Features.marketingOperator?.attributionV1 === true,
  });

  return {
    identity: {
      storeId: String(business.id),
      slug,
      businessName: withProvenance(nameValue, ownerTag, 'business.name', ownerConfirmed ? 0.99 : 0.85),
      legalName: withProvenance(null, ProvenanceTag.UNVERIFIED, undefined, 0),
      abn: withProvenance(null, ProvenanceTag.UNVERIFIED, undefined, 0),
    },
    location: {
      suburb: withProvenance(suburbValue, ownerTag, 'business.suburb', 0.85),
      state: withProvenance(stateValue, ProvenanceTag.PLATFORM_OBSERVED, 'business.state', 0.85),
      country: withProvenance(countryValue, ProvenanceTag.PLATFORM_INFERRED, 'business.country', 0.7),
      address: withProvenance(addressValue, ownerTag, 'business.address', 0.85),
      coordinates: withProvenance(
        coords,
        coords ? ProvenanceTag.PLATFORM_OBSERVED : ProvenanceTag.UNVERIFIED,
        business.locationSource || 'business.latlng',
        coords ? 0.8 : 0,
      ),
    },
    classification: {
      category: withProvenance(
        categoryValue,
        artifact?.category ? ProvenanceTag.PLATFORM_OBSERVED : ProvenanceTag.AI_INFERRED,
        artifact?.category ? 'published_artifact.category' : 'business.type',
        0.8,
      ),
      subCategory: withProvenance(null, ProvenanceTag.UNVERIFIED, undefined, 0),
      tags: withProvenance([], ProvenanceTag.PLATFORM_INFERRED, undefined, 0.4),
      cuisineTags: withProvenance([], ProvenanceTag.PLATFORM_INFERRED, undefined, 0.4),
      industryCode: withProvenance(null, ProvenanceTag.UNVERIFIED, undefined, 0),
    },
    content: {
      tagline: withProvenance(
        taglineValue,
        ownerConfirmed ? ProvenanceTag.SELLER_CONFIRMED : ProvenanceTag.AI_INFERRED,
        'business.tagline',
        ownerConfirmed ? 0.95 : 0.7,
      ),
      description: withProvenance(
        descriptionValue,
        ownerConfirmed ? ProvenanceTag.SELLER_CONFIRMED : ProvenanceTag.AI_INFERRED,
        'business.description',
        ownerConfirmed ? 0.99 : 0.75,
      ),
      heroImageUrl: withProvenance(
        heroImageValue,
        ProvenanceTag.PLATFORM_OBSERVED,
        'hero',
        heroImageValue ? 0.85 : 0,
      ),
      logoUrl: withProvenance(avatar, ProvenanceTag.PLATFORM_OBSERVED, 'business.logo', avatar ? 0.85 : 0),
      heroVideoUrl: withProvenance(
        heroVideoValue,
        ProvenanceTag.PLATFORM_OBSERVED,
        'hero.video',
        heroVideoValue ? 0.85 : 0,
      ),
    },
    contact: {
      phone: withProvenance(phoneValue, ownerTag, 'business.phone', phoneValue ? 0.9 : 0),
      email: withProvenance(emailValue, ownerTag, 'business.email', emailValue ? 0.9 : 0),
      website: withProvenance(
        websiteValue,
        ProvenanceTag.PLATFORM_OBSERVED,
        'business.websiteUrl',
        websiteValue ? 0.85 : 0,
      ),
      socialLinks: withProvenance(
        socialLinksOf(business),
        ProvenanceTag.PLATFORM_OBSERVED,
        'business.socialLinks',
        0.7,
      ),
    },
    commerce: {
      openingHours: withProvenance(
        business.tradingHours ?? null,
        ProvenanceTag.PLATFORM_OBSERVED,
        'business.tradingHours',
        business.tradingHours ? 0.75 : 0,
      ),
      priceRange: withProvenance(null, ProvenanceTag.UNVERIFIED, undefined, 0),
      acceptsBookings: withProvenance(
        String(business.transactionMode || '').toLowerCase() === 'booking',
        ProvenanceTag.PLATFORM_INFERRED,
        'business.transactionMode',
        0.6,
      ),
      acceptsOnlineOrders: withProvenance(
        String(business.transactionMode || '').toLowerCase() === 'order',
        ProvenanceTag.PLATFORM_INFERRED,
        'business.transactionMode',
        0.6,
      ),
      catalogItemCount: withProvenance(products.length, ProvenanceTag.PLATFORM_OBSERVED, 'catalog', 0.9),
      activeCampaignCount: withProvenance(0, ProvenanceTag.PLATFORM_INFERRED, undefined, 0.3),
    },
    intelligence: {
      biSummary: withProvenance(biSummaryValue, biProv, biSource, biConf),
      performerInsights: withProvenance(
        insights,
        insights.length ? insightProv : ProvenanceTag.UNVERIFIED,
        insights.length ? 'mission_001' : undefined,
        insights.length ? 0.7 : 0,
      ),
      enrichmentStatus,
      enrichmentSources,
      lastEnrichedAt: artifact?.publishedAt
        ? String(artifact.publishedAt)
        : new Date(business.publishedAt).toISOString(),
    },
    visibility: {
      canonicalUrl,
      indexable,
      jsonLdReady,
      sitemapIncluded: visFlags.sitemapIncluded,
      aiSearchReady: visFlags.aiSearchReady,
    },
    generatedAt: new Date().toISOString(),
    version: SKP_VERSION,
  };
}

/** @param {string} storeId @param {{ prisma?: any, boiSnapshot?: object|null, mission001?: object|null }} [opts] */
export async function buildSKP(storeId, opts = {}) {
  const id = String(storeId || '').trim();
  if (!id) return null;

  let prisma = opts.prisma;
  if (!prisma) {
    const mod = await import('../prisma.js');
    prisma = mod.prisma || mod.default || (await mod.getPrismaClient?.());
  }
  if (!prisma?.business?.findUnique) return null;

  const business = await prisma.business.findUnique({
    where: { id },
    include: {
      publishedArtifactProjection: true,
      products: {
        where: { isPublished: true },
        take: 200,
        select: { id: true, name: true },
      },
    },
  });
  if (!business) return null;

  const artifactRow = business.publishedArtifactProjection;
  const artifact =
    artifactRow?.projectionJson && typeof artifactRow.projectionJson === 'object'
      ? artifactRow.projectionJson
      : null;

  return buildSKPFromSources({
    business,
    artifact,
    boiSnapshot: opts.boiSnapshot ?? null,
    mission001: opts.mission001 ?? null,
  });
}

/**
 * Load by public slug (normalized lowercase).
 * @param {string} slug
 * @param {{ prisma?: any, boiSnapshot?: object|null, mission001?: object|null }} [opts]
 */
export async function buildSKPBySlug(slug, opts = {}) {
  const normalized = String(slug || '').trim().toLowerCase();
  if (!normalized) return null;

  let prisma = opts.prisma;
  if (!prisma) {
    const mod = await import('../prisma.js');
    prisma = mod.prisma || mod.default || (await mod.getPrismaClient?.());
  }
  if (!prisma?.business?.findFirst) return null;

  const business = await prisma.business.findFirst({
    where: { slug: normalized },
    include: {
      publishedArtifactProjection: true,
      products: {
        where: { isPublished: true },
        take: 200,
        select: { id: true, name: true },
      },
    },
  });
  if (!business) return null;

  const artifactRow = business.publishedArtifactProjection;
  const artifact =
    artifactRow?.projectionJson && typeof artifactRow.projectionJson === 'object'
      ? artifactRow.projectionJson
      : null;

  return buildSKPFromSources({
    business,
    artifact,
    boiSnapshot: opts.boiSnapshot ?? null,
    mission001: opts.mission001 ?? null,
  });
}

export function skpToPublicDto(skp) {
  if (!skp) return null;
  return {
    id: skp.identity.storeId,
    slug: skp.identity.slug,
    name: skp.identity.businessName.value,
    tagline: skp.content.tagline.value,
    description: skp.content.description.value,
    category: skp.classification.category.value,
    subCategory: skp.classification.subCategory.value,
    suburb: skp.location.suburb.value,
    state: skp.location.state.value,
    country: skp.location.country.value,
    address: skp.location.address.value,
    phone: skp.contact.phone.value,
    email: skp.contact.email.value,
    website: skp.contact.website.value,
    socialLinks: skp.contact.socialLinks.value,
    heroImageUrl: skp.content.heroImageUrl.value,
    logoUrl: skp.content.logoUrl.value,
    heroVideoUrl: skp.content.heroVideoUrl.value,
    openingHours: skp.commerce.openingHours.value,
    catalogItemCount: skp.commerce.catalogItemCount.value,
    canonicalUrl: skp.visibility.canonicalUrl,
    indexable: skp.visibility.indexable,
    jsonLdReady: skp.visibility.jsonLdReady,
    aiSearchReady: skp.visibility.aiSearchReady,
  };
}

export const skpToPublicDTO = skpToPublicDto;

const CATEGORY_SCHEMA_TYPE = Object.freeze({
  'Food & Drink': 'FoodEstablishment',
  Restaurant: 'Restaurant',
  Cafe: 'CafeOrCoffeeShop',
  'Beauty & Wellness': 'BeautySalon',
  'Health & Fitness': 'SportsActivityLocation',
  Professional: 'ProfessionalService',
  Retail: 'Store',
  'Home & Trade': 'HomeAndConstructionBusiness',
});

export function skpToJsonLd(skp) {
  if (!skp?.visibility?.jsonLdReady) return null;

  const category = skp.classification.category.value;
  const refined = CATEGORY_SCHEMA_TYPE[category];
  const type = refined ? ['LocalBusiness', refined] : 'LocalBusiness';

  const ld = {
    '@context': 'https://schema.org',
    '@type': type,
    name: skp.identity.businessName.value,
    url: skp.visibility.canonicalUrl,
    description: skp.content.description.value,
  };

  if (skp.location.address.value || skp.location.suburb.value) {
    ld.address = {
      '@type': 'PostalAddress',
      streetAddress: skp.location.address.value || undefined,
      addressLocality: skp.location.suburb.value || undefined,
      addressRegion: skp.location.state.value || undefined,
      addressCountry: skp.location.country.value || undefined,
    };
  }

  const coords = skp.location.coordinates.value;
  if (coords?.lat != null && coords?.lng != null) {
    ld.geo = {
      '@type': 'GeoCoordinates',
      latitude: coords.lat,
      longitude: coords.lng,
    };
  }

  if (skp.contact.phone.value) ld.telephone = skp.contact.phone.value;
  if (skp.contact.email.value) ld.email = skp.contact.email.value;

  const sameAs = [];
  if (skp.contact.website.value) sameAs.push(skp.contact.website.value);
  for (const url of Object.values(skp.contact.socialLinks.value || {})) {
    if (url) sameAs.push(url);
  }
  if (sameAs.length) ld.sameAs = sameAs;

  if (skp.content.heroImageUrl.value) ld.image = skp.content.heroImageUrl.value;
  if (skp.content.tagline.value) ld.slogan = skp.content.tagline.value;

  return ld;
}

export const skpToJsonLD = skpToJsonLd;
