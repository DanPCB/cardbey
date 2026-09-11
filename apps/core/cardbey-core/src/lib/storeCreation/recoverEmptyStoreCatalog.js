/**
 * Phase 2 — recover / seed empty store catalogs (never sparse_honest).
 */

/**
 * @param {object|null|undefined} catalog
 * @returns {number}
 */
export function countCatalogItems(catalog) {
  if (!catalog || typeof catalog !== 'object') return 0;
  if (Array.isArray(catalog.products) && catalog.products.length) return catalog.products.length;
  if (Array.isArray(catalog.items) && catalog.items.length) return catalog.items.length;
  return 0;
}

/**
 * Resolve verticalSlug from draft input / preview / params.
 * @param {{ input?: object, preview?: object, params?: object }} opts
 * @returns {string|null}
 */
export function resolveVerticalSlugFromDraftContext(opts = {}) {
  const input = opts.input && typeof opts.input === 'object' ? opts.input : {};
  const preview = opts.preview && typeof opts.preview === 'object' ? opts.preview : {};
  const params = opts.params && typeof opts.params === 'object' ? opts.params : {};
  const meta = preview.meta && typeof preview.meta === 'object' ? preview.meta : {};
  const raw =
    params.verticalSlug ??
    input.verticalSlug ??
    input.vertical ??
    meta.verticalSlug ??
    meta.vertical ??
    preview.verticalSlug ??
    null;
  const explicit = typeof raw === 'string' ? raw.trim() : '';
  if (explicit) return explicit;

  try {
    // Sync resolve from name/type already on the draft (same as ensureStoreCreationCatalogItems).
    const { resolveVertical } = require('../verticals/verticalTaxonomy.js');
    const storeType = String(
      params.storeType ??
        params.businessType ??
        input.storeType ??
        input.businessType ??
        preview.storeType ??
        meta.storeType ??
        '',
    ).trim();
    const businessName = String(
      params.businessName ?? input.businessName ?? preview.storeName ?? '',
    ).trim();
    if (!storeType && !businessName) return null;
    const resolved = resolveVertical({
      businessType: storeType,
      businessName,
      explicitVertical: null,
    });
    const slug = typeof resolved?.slug === 'string' ? resolved.slug.trim() : '';
    return slug || null;
  } catch {
    return null;
  }
}

/**
 * One-shot ensure/seed when catalog is empty (used by early recover paths).
 * Emits store:catalog_recovered when recovered (legacy Phase 2 event).
 *
 * @param {{
 *   catalog: object|null|undefined,
 *   params?: object,
 *   input?: object,
 *   missionId?: string|null,
 *   draftId?: string|null,
 * }} opts
 * @returns {Promise<{ catalog: object, recovered: boolean, itemCount: number }>}
 */
export async function recoverEmptyStoreCatalog(opts = {}) {
  const params = opts.params && typeof opts.params === 'object' ? opts.params : {};
  const input = opts.input && typeof opts.input === 'object' ? opts.input : {};
  let catalog = opts.catalog && typeof opts.catalog === 'object' ? opts.catalog : {};
  const before = countCatalogItems(catalog);
  const sparse = catalog?.meta?.catalogSource === 'sparse_honest';

  if (before > 0 || sparse) {
    return { catalog, recovered: false, itemCount: before };
  }

  try {
    const { ensureStoreCreationCatalogItems } = await import(
      '../../services/draftStore/ensureStoreCreationCatalogItems.js'
    );
    catalog = ensureStoreCreationCatalogItems(catalog, params, input);
  } catch (err) {
    console.warn('[recoverEmptyStoreCatalog] ensure failed (non-fatal):', err?.message ?? err);
    return { catalog, recovered: false, itemCount: 0 };
  }

  const after = countCatalogItems(catalog);
  const recovered = after > 0;
  if (recovered) {
    console.log('[recoverEmptyStoreCatalog] recovered', {
      draftId: opts.draftId ?? null,
      missionId: opts.missionId ?? null,
      itemCount: after,
    });
    const missionId = typeof opts.missionId === 'string' ? opts.missionId.trim() : '';
    const draftId = typeof opts.draftId === 'string' ? opts.draftId.trim() : '';
    if (missionId && draftId) {
      try {
        const { appendStoreCreationBlackboardEvent } = await import('./storeCreationBlackboard.js');
        await appendStoreCreationBlackboardEvent(missionId, 'store:catalog_recovered', {
          draftId,
          itemCount: after,
        });
      } catch {
        /* non-fatal */
      }
    }
  }

  return { catalog, recovered, itemCount: after };
}

/**
 * After store:catalog_complete with itemCount === 0: vertical seed → patch draft preview.
 * Emits store:catalog_seeded { itemCount, source: 'vertical_seed' }.
 * Non-blocking: failures log and return without throwing.
 *
 * @param {{ missionId: string, draftId: string }} opts
 * @returns {Promise<{ seeded: boolean, itemCount: number }>}
 */
export async function seedEmptyCatalogAfterComplete(opts = {}) {
  const missionId = typeof opts.missionId === 'string' ? opts.missionId.trim() : '';
  const draftId = typeof opts.draftId === 'string' ? opts.draftId.trim() : '';
  if (!missionId || !draftId) return { seeded: false, itemCount: 0 };

  try {
    const { getPrismaClient } = await import('../prisma.js');
    const prisma = getPrismaClient();
    const draft = await prisma.draftStore.findUnique({ where: { id: draftId } });
    if (!draft) return { seeded: false, itemCount: 0 };

    const preview =
      draft.preview && typeof draft.preview === 'object' && !Array.isArray(draft.preview)
        ? { ...draft.preview }
        : {};
    const input =
      draft.input && typeof draft.input === 'object' && !Array.isArray(draft.input)
        ? draft.input
        : {};

    const existingItems = Array.isArray(preview.items)
      ? preview.items
      : Array.isArray(preview.catalog?.products)
        ? preview.catalog.products
        : Array.isArray(preview.products)
          ? preview.products
          : [];
    if (existingItems.length > 0) {
      return { seeded: false, itemCount: existingItems.length };
    }
    if (preview.meta?.catalogSource === 'sparse_honest') {
      return { seeded: false, itemCount: 0 };
    }

    const verticalSlug = resolveVerticalSlugFromDraftContext({ input, preview });
    if (!verticalSlug) {
      console.warn('[seedEmptyCatalogAfterComplete] skip — no verticalSlug', {
        missionId,
        draftId,
      });
      return { seeded: false, itemCount: 0 };
    }

    const { ensureStoreCreationCatalogItems } = await import(
      '../../services/draftStore/ensureStoreCreationCatalogItems.js'
    );
    const seededCatalog = ensureStoreCreationCatalogItems(
      {
        products: [],
        items: [],
        categories: Array.isArray(preview.categories) ? preview.categories : [],
        meta: { ...(preview.meta && typeof preview.meta === 'object' ? preview.meta : {}) },
      },
      {
        verticalSlug,
        businessName: preview.storeName ?? input.businessName,
        storeType: preview.storeType ?? input.storeType ?? input.businessType,
        businessType: input.businessType ?? preview.storeType,
        draftId,
      },
      input,
    );

    const products = Array.isArray(seededCatalog?.products)
      ? seededCatalog.products
      : Array.isArray(seededCatalog?.items)
        ? seededCatalog.items
        : [];
    if (!products.length) {
      console.warn('[seedEmptyCatalogAfterComplete] seed returned 0 items', {
        missionId,
        draftId,
        verticalSlug,
      });
      return { seeded: false, itemCount: 0 };
    }

    const categories = Array.isArray(seededCatalog.categories)
      ? seededCatalog.categories
      : Array.isArray(preview.categories)
        ? preview.categories
        : [];

    const nextPreview = {
      ...preview,
      items: products,
      categories,
      catalog: {
        ...(preview.catalog && typeof preview.catalog === 'object' ? preview.catalog : {}),
        products,
        categories,
      },
      meta: {
        ...(preview.meta && typeof preview.meta === 'object' ? preview.meta : {}),
        ...(seededCatalog.meta && typeof seededCatalog.meta === 'object' ? seededCatalog.meta : {}),
        catalogSource: 'vertical_seed',
        emptyCatalogSeeded: true,
        verticalSlug,
        missionId,
      },
    };

    await prisma.draftStore.update({
      where: { id: draftId },
      data: { preview: nextPreview, updatedAt: new Date() },
    });

    const { appendStoreCreationBlackboardEvent } = await import('./storeCreationBlackboard.js');
    await appendStoreCreationBlackboardEvent(missionId, 'store:catalog_seeded', {
      draftId,
      itemCount: products.length,
      source: 'vertical_seed',
      verticalSlug,
    });

    console.log('[seedEmptyCatalogAfterComplete] seeded', {
      missionId,
      draftId,
      itemCount: products.length,
      verticalSlug,
    });

    return { seeded: true, itemCount: products.length };
  } catch (err) {
    console.warn('[seedEmptyCatalogAfterComplete] failed (non-fatal):', err?.message ?? err);
    return { seeded: false, itemCount: 0 };
  }
}
