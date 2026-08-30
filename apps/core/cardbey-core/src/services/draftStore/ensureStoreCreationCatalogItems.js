/**
 * Golden Path — never ship an empty menu/catalog after store creation build.
 * Presentation-safe fallback: cuisine → industry blueprint → universal seed.
 */
import { CATALOG_ITEM_LIMIT } from '../../config/catalogLimits.js';
import { resolveVertical } from '../../lib/verticals/verticalTaxonomy.js';
import { buildCuisineMenuCatalog } from './foodCuisineCatalog.js';
import { buildIndustryCatalog } from './industryBlueprintRegistry.js';
import { buildSeedCatalog } from '../store/seeds/seedCatalogBuilder.js';

function readProductCount(catalog) {
  if (!catalog || typeof catalog !== 'object') return 0;
  if (Array.isArray(catalog.products) && catalog.products.length > 0) return catalog.products.length;
  if (Array.isArray(catalog.items) && catalog.items.length > 0) return catalog.items.length;
  return 0;
}

function buildRecoveryProfile(params = {}, input = {}) {
  const businessName = String(params.businessName ?? input?.businessName ?? input?.storeName ?? '').trim();
  const storeType = String(
    params.storeType ?? params.businessType ?? input?.storeType ?? input?.businessType ?? input?.category ?? '',
  ).trim();
  const verticalResolved = resolveVertical({
    businessType: storeType,
    businessName,
    userNotes: [params.location, input?.location].filter(Boolean).join(' '),
    explicitVertical: params.verticalSlug ?? input?.verticalSlug ?? input?.vertical ?? null,
  });
  const verticalSlug =
    params.verticalSlug ??
    input?.verticalSlug ??
    verticalResolved?.slug ??
    (storeType ? String(storeType).toLowerCase().replace(/\s+/g, '_').replace(/&/g, 'and') : null);
  const verticalGroup =
    params.verticalGroup ??
    input?.verticalGroup ??
    verticalResolved?.group ??
    (verticalSlug ? String(verticalSlug).split('.')[0] : null);

  return {
    verticalGroup: verticalGroup || 'food',
    verticalSlug: verticalSlug || 'food.generic',
    businessName,
    storeName: businessName,
    businessType: storeType || params.businessType,
    storeType: storeType || params.storeType,
    currencyCode: params.currencyCode ?? input?.currencyCode ?? input?.currency ?? 'AUD',
  };
}

function mapSeedItemsToProducts(seed, draftId) {
  const categories = Array.isArray(seed?.categories) ? seed.categories : [];
  const items = Array.isArray(seed?.items) ? seed.items : [];
  const prefix = draftId ? String(draftId) : 'gen';
  return items.map((it, i) => ({
    id: it.id ?? `item_recover_${prefix}_${i}`,
    name: it.name,
    description: it.description ?? null,
    price: it.price ?? null,
    categoryId: it.categoryId ?? categories[0]?.id ?? `cat_recover_${prefix}_0`,
    imageUrl: it.imageUrl ?? null,
  }));
}

/**
 * @param {object|null|undefined} catalog
 * @param {object} [params]
 * @param {object} [input]
 */
export function ensureStoreCreationCatalogItems(catalog, params = {}, input = {}) {
  if (readProductCount(catalog) > 0) return catalog;

  const profile = buildRecoveryProfile(params, input);
  const targetCount = CATALOG_ITEM_LIMIT;
  const industry = buildIndustryCatalog(profile, targetCount);
  const cuisine =
    industry?.items?.length ? null : buildCuisineMenuCatalog(profile, targetCount);
  const seed =
    industry?.items?.length
      ? industry
      : cuisine?.items?.length
        ? cuisine
        : buildSeedCatalog(profile, { targetCount });

  const products = mapSeedItemsToProducts(seed, params.draftId ?? input?.draftId);
  if (!products.length) return catalog;

  const prev = catalog && typeof catalog === 'object' ? catalog : {};
  const prevProfile = prev.profile && typeof prev.profile === 'object' ? prev.profile : {};

  return {
    ...prev,
    profile: {
      name: prevProfile.name ?? profile.businessName ?? 'Store',
      type: prevProfile.type ?? profile.storeType ?? profile.businessType ?? 'Food & drink',
      ...prevProfile,
    },
    categories: seed?.categories?.length ? seed.categories : prev.categories ?? [],
    products,
    meta: {
      ...(prev.meta && typeof prev.meta === 'object' ? prev.meta : {}),
      ...(seed?.meta && typeof seed.meta === 'object' ? seed.meta : {}),
      catalogSource: prev.meta?.catalogSource ?? 'store_creation_catalog_recovery',
      emptyCatalogRecovered: true,
    },
  };
}
