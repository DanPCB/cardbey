/**
 * Build canonical PublishedBusinessArtifact v1 from Business + optional draft preview.
 */

import { resolvePublishedStoreCopyFromPreview } from '../draftStore/publishRunway.js';
import { resolveMiniWebsiteForPublish } from '../draftStore/draftPreviewHeroSync.js';
import { parseJsonBlob } from './parseJsonBlob.js';
import { resolveHeroForProjection } from './resolveHeroForProjection.js';
import { publicWebBase } from '../../utils/publicWebBase.js';
import { parseSocialLinks } from '../../lib/socialLinks.js';
import { coerceServiceCtaLabel, resolveTransactionCommerce } from '../../lib/storeTransactionMode.js';
import { buildStoreLocationFields } from '../../lib/formatStoreLocation.js';

export const PUBLISHED_ARTIFACT_VERSION = 'v1';
const GENERIC_CARD_FALLBACK = 'browse our menu and order online';
const GENERIC_DESC_PATTERN = /is your local .+ browse our menu and order online/i;

function trim(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function isGenericStoreDescription(desc) {
  if (!desc) return false;
  const d = desc.toLowerCase().trim();
  return d.includes(GENERIC_CARD_FALLBACK) || GENERIC_DESC_PATTERN.test(d);
}

function heroSectionContent(resolvedMini) {
  const section = Array.isArray(resolvedMini?.sections)
    ? resolvedMini.sections.find((s) => s && s.type === 'hero')
    : null;
  return section?.content && typeof section.content === 'object' ? section.content : null;
}

function mapProducts(business, draftPreview) {
  const fromDraft = Array.isArray(draftPreview?.items) ? draftPreview.items : [];
  if (fromDraft.length) {
    return fromDraft.map((item, i) => ({
      id: item.id ?? item.productId ?? `item_${i}`,
      name: item.name ?? item.title ?? 'Item',
      description: item.description ?? null,
      price: item.price ?? item.priceCents ?? null,
      imageUrl: item.imageUrl ?? item.image ?? null,
      categoryId: item.categoryId ?? null,
    }));
  }
  const rel = business?.products;
  if (!Array.isArray(rel)) return [];
  return rel.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    price: p.price ?? null,
    imageUrl: p.imageUrl ?? null,
    categoryId: p.categoryId ?? null,
  }));
}

/**
 * @param {object} params
 * @param {object} params.business - Business row (may include products)
 * @param {object} [params.draft] - DraftStore row
 * @param {object} [params.draftPreview] - parsed preview
 * @param {string} [params.source]
 * @param {string} [params.publishRunId]
 */
export function buildPublishedBusinessArtifact({
  business,
  draft = null,
  draftPreview = null,
  website = null,
  miniWebsite = null,
  media = null,
  menus = null,
  products = null,
  playlists = null,
  source = 'publishDraft',
  publishRunId = null,
}) {
  const warnings = [];
  const rawPreview = draftPreview ?? parseJsonBlob(draft?.preview) ?? null;
  const stylePrefs = parseJsonBlob(business?.stylePreferences) ?? {};
  const resolvedMini =
    miniWebsite ??
    resolveMiniWebsiteForPublish(rawPreview) ??
    stylePrefs.miniWebsite ??
    null;

  const heroContent = heroSectionContent(resolvedMini);

  const copyFromDraft = rawPreview ? resolvePublishedStoreCopyFromPreview(rawPreview) : null;
  const tagline =
    trim(copyFromDraft?.tagline) ??
    trim(rawPreview?.tagline) ??
    trim(rawPreview?.slogan) ??
    trim(heroContent?.headline) ??
    trim(heroContent?.subheadline) ??
    trim(business?.tagline) ??
    null;

  let description =
    trim(copyFromDraft?.description) ??
    trim(rawPreview?.description) ??
    trim(rawPreview?.heroText) ??
    trim(resolvedMini?.about?.description) ??
    trim(business?.description) ??
    trim(business?.heroText) ??
    null;

  if (isGenericStoreDescription(description)) {
    description =
      trim(heroContent?.subheadline) ??
      trim(heroContent?.headline) ??
      tagline ??
      null;
  }

  if (!description && tagline) description = tagline;
  if (description && description.toLowerCase() === GENERIC_CARD_FALLBACK) {
    warnings.push({ code: 'generic_description', message: 'Description matches generic card fallback text' });
  }

  const hero = resolveHeroForProjection({
    business,
    draftPreview: rawPreview,
    miniWebsite: resolvedMini,
  });

  if ((hero.type === 'video' || hero.type === 'image') && !hero.videoUrl && !hero.imageUrl) {
    warnings.push({ code: 'hero_unresolved', message: 'Hero type set but no media URL' });
  }

  const slug = trim(business?.slug);
  const tenantId = trim(business?.userId);
  const businessId = trim(business?.id);
  const webBase = publicWebBase();
  const productList = products ?? mapProducts(business, rawPreview);
  const sections = Array.isArray(resolvedMini?.sections) ? resolvedMini.sections : [];

  if (!slug) warnings.push({ code: 'missing_slug', message: 'slug is required' });
  if (!trim(business?.name)) warnings.push({ code: 'missing_name', message: 'name is required' });
  if (!tenantId) warnings.push({ code: 'missing_tenant', message: 'tenantId is required' });
  if (!businessId) warnings.push({ code: 'missing_business_id', message: 'businessId is required' });
  if (sections.length === 0) {
    warnings.push({ code: 'no_website_sections', message: 'No mini-website sections on projection' });
  }

  const storefront = parseJsonBlob(business?.storefrontSettings) ?? {};
  const locationFields = buildStoreLocationFields(business);

  return {
    artifactType: 'business',
    artifactVersion: PUBLISHED_ARTIFACT_VERSION,
    businessId,
    tenantId,
    storeId: businessId,
    slug,
    name: trim(business?.name) ?? '',
    category: trim(business?.type) ?? null,
    status: business?.isActive === true ? 'published' : 'inactive',
    publishedAt: business?.publishedAt?.toISOString?.() ?? new Date().toISOString(),

    location: {
      address: locationFields.address,
      suburb: locationFields.suburb,
      city: locationFields.city,
      state: locationFields.state,
      postcode: locationFields.postcode,
      country: locationFields.country,
      lat: locationFields.lat,
      lng: locationFields.lng,
      displayLabel: locationFields.locationLabel,
    },

    content: {
      tagline,
      shortDescription: description,
      description,
      story: trim(rawPreview?.story) ?? null,
      ctaPrimary: coerceServiceCtaLabel({
        businessType: business?.type,
        transactionMode: business?.transactionMode,
        ctaLabel: trim(storefront?.cta?.label) ?? trim(business?.ctaLabel),
      }) || resolveTransactionCommerce(business?.type).ctaLabel,
      ctaSecondary: trim(storefront?.ctaSecondary) ?? null,
      locale: trim(rawPreview?.locale) ?? 'en',
      socialLinks: parseSocialLinks(business?.socialLinks),
    },

    brand: {
      logoUrl:
        trim(business?.avatarImageUrl) ??
        trim(stylePrefs.profileAvatarUrl) ??
        (() => {
          const logo = parseJsonBlob(business?.logo);
          return trim(logo?.url) ?? trim(logo?.avatarUrl) ?? null;
        })(),
      colors: {
        primary: trim(business?.primaryColor) ?? null,
        secondary: trim(business?.secondaryColor) ?? null,
      },
      typography: stylePrefs.typography ?? null,
      style: stylePrefs.style ?? stylePrefs.mood ?? null,
    },

    hero,

    website: {
      templateId: trim(rawPreview?.websiteTemplateId) ?? trim(stylePrefs.templateId) ?? null,
      sections,
      navigation: resolvedMini?.navigation ?? website?.navigation ?? null,
      seo: resolvedMini?.seo ?? website?.seo ?? null,
    },

    commerce: {
      products: productList,
      menus: menus ?? [],
      orderingEnabled: (business?.transactionMode ?? 'order') !== 'none',
    },

    channels: {
      publicWebsite: {
        enabled: sections.length > 0 || !!slug,
        url: slug ? `${webBase}/s/${encodeURIComponent(slug)}` : null,
      },
      homepageCard: { enabled: business?.isActive === true },
      qrLanding: { enabled: !!slug },
      signage: {
        enabled: false,
        playlistIds: Array.isArray(playlists) ? playlists.map((p) => p.id).filter(Boolean) : [],
      },
      campaign: { enabled: false },
    },

    media: media ?? {
      images: productList.map((p) => p.imageUrl).filter(Boolean),
      videos: hero.videoUrl ? [hero.videoUrl] : [],
      heroAssets: [hero.imageUrl, hero.videoUrl, hero.posterUrl].filter(Boolean),
      signageAssets: [],
    },

    mi: {
      entities: [],
      brain: null,
      intentGraph: null,
      capabilities: [],
    },

    diagnostics: {
      projectionVersion: PUBLISHED_ARTIFACT_VERSION,
      sourceDraftId: trim(draft?.id) ?? null,
      sourcePublishRunId: trim(publishRunId) ?? null,
      generatedAt: new Date().toISOString(),
      source,
      warnings,
    },
  };
}
