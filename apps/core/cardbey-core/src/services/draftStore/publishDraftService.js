/**
 * Publish Draft Service
 * Core logic to publish a draft store to Business + Products. Used by POST /api/stores/publish and POST /api/automation/store-from-input.
 *
 * Idempotency and multi-store:
 * - If the draft is already committed (status === 'committed', committedStoreId set), returns the existing store without creating a new Business.
 * - When storeId === 'temp', we always create a NEW Business (multi-store); we do not reuse the user's existing store.
 * Verification: Publish same draft twice -> second call returns same store. Guest draft -> sign in -> publish works. User with existing store(s) publishing temp draft -> new store created.
 */

import { generateUniqueStoreSlug, slugify } from '../../utils/slug.js';
import { parseDraftPreview } from './draftPreviewSchema.ts';
import { normalizePreviewCategories } from './draftStoreService.js';

async function loadExistingStorefrontSettings(prisma, businessId) {
  if (!businessId) return {};
  const row = await prisma.business.findUnique({
    where: { id: businessId },
    select: { storefrontSettings: true },
  });
  const raw = row?.storefrontSettings;
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed && !Array.isArray(parsed) ? { ...parsed } : {};
    } catch {
      return {};
    }
  }
  return {};
}
import { isDraftOwnedByUser } from '../../lib/draftOwnership.js';
import { transitionDraftStoreStatus } from '../../kernel/transitions/transitionService.js';
import { refreshPersonalPresenceQrForBusiness } from '../personalPresence/personalPresenceQr.js';

/**
 * Draft mini-website featured sections use stable keys (idx_0, draft temp ids) from mergeWebsiteIntoPreview.
 * Published products get new Prisma ids — remap featured content.productIds so the public /s/:slug renderer
 * can resolve picks (same keys as toPublicStore().products[].id).
 *
 * @param {object} miniWebsite - stylePreferences.miniWebsite snapshot from draft
 * @param {object[]} draftProducts - preview.items / catalog rows in publish order
 * @param {(string|undefined|null)[]} publishedIdsByDraftIndex - parallel array: draft index -> Product.id
 * @returns {object}
 */
export function remapMiniWebsiteFeaturedProductIds(miniWebsite, draftProducts, publishedIdsByDraftIndex) {
  if (!miniWebsite || typeof miniWebsite !== 'object') return miniWebsite;
  const sections = miniWebsite.sections;
  if (!Array.isArray(sections)) return miniWebsite;

  function stableKey(item, index) {
    if (!item || typeof item !== 'object') return `idx_${index}`;
    const id = item.id != null && String(item.id).trim() ? String(item.id).trim() : null;
    if (id) return id;
    const pid = item.productId != null && String(item.productId).trim() ? String(item.productId).trim() : null;
    if (pid) return pid;
    return `idx_${index}`;
  }

  const keyToPublishedId = new Map();
  for (let i = 0; i < draftProducts.length; i++) {
    const pubId = publishedIdsByDraftIndex[i];
    if (!pubId || typeof pubId !== 'string') continue;
    keyToPublishedId.set(stableKey(draftProducts[i], i), pubId);
  }

  const newSections = sections.map((section) => {
    if (!section || section.type !== 'featured') return section;
    const content = section.content && typeof section.content === 'object' ? { ...section.content } : {};
    const rawIds = content.productIds;
    if (!Array.isArray(rawIds) || rawIds.length === 0) return section;
    const newIds = [];
    for (const rid of rawIds) {
      const key = String(rid);
      let mapped = keyToPublishedId.get(key);
      if (!mapped) {
        const m = /^idx_(\d+)$/.exec(key);
        if (m) {
          const idx = parseInt(m[1], 10);
          const at = publishedIdsByDraftIndex[idx];
          if (at && typeof at === 'string') mapped = at;
        }
      }
      if (mapped) newIds.push(mapped);
    }
    return { ...section, content: { ...content, productIds: newIds } };
  });

  return { ...miniWebsite, sections: newSections };
}

export class PublishDraftError extends Error {
  constructor(code, message, statusCode = 500) {
    super(message);
    this.name = 'PublishDraftError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Find target draft by storeId and optional generationRunId (same rules as stores.js publish handler).
 */
async function findTargetDraft(prisma, storeId, generationRunId) {
  const isTempStore = storeId === 'temp';
  let draftStores = [];
  if (isTempStore && generationRunId) {
    const allCandidates = await prisma.draftStore.findMany({
      where: { status: { in: ['draft', 'generating', 'ready', 'error'] } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    draftStores = allCandidates.filter((d) => {
      try {
        const input = typeof d.input === 'string' ? JSON.parse(d.input) : (d.input || {});
        return input.generationRunId === generationRunId || d.generationRunId === generationRunId;
      } catch (e) {
        return false;
      }
    });
  } else {
    draftStores = await prisma.draftStore.findMany({
      where: {
        committedStoreId: storeId,
        status: { in: ['draft', 'generating', 'ready', 'error'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
  }

  let targetDraft = null;
  if (generationRunId && draftStores.length > 0) {
    for (const draft of draftStores) {
      try {
        const draftInput = typeof draft.input === 'string' ? JSON.parse(draft.input) : draft.input;
        if (draftInput?.generationRunId === generationRunId || draft.generationRunId === generationRunId) {
          targetDraft = draft;
          break;
        }
      } catch (e) {
        // Skip parse errors
      }
    }
  }
  if (!targetDraft && draftStores.length > 0) {
    const STATUS_PRIORITY = { ready: 4, draft: 3, generating: 2, error: 1 };
    draftStores.sort((a, b) => {
      const priorityA = STATUS_PRIORITY[a.status] || 0;
      const priorityB = STATUS_PRIORITY[b.status] || 0;
      if (priorityA !== priorityB) return priorityB - priorityA;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
    targetDraft = draftStores[0];
  }
  return targetDraft;
}

/**
 * Publish a draft to a store. Creates Business if storeId is 'temp'.
 * When draftId is provided, that exact draft is used (ensures we publish the draft just saved by the client).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ storeId: string, generationRunId?: string, draftId?: string, userId: string }} params
 * @returns {Promise<{ storeId: string, slug: string, storefrontUrl: string }>}
 * @throws {PublishDraftError} DRAFT_NOT_FOUND, AUTH_REQUIRED, etc.
 */
export async function publishDraft(prisma, { storeId, generationRunId, draftId, userId }) {
  if (!userId) {
    throw new PublishDraftError('AUTH_REQUIRED', 'Authentication required to publish a store.', 401);
  }

  function extractDraftMiniWebsite(rawPreview) {
    const draftStylePrefs =
      rawPreview?.stylePreferences && typeof rawPreview.stylePreferences === 'object'
        ? rawPreview.stylePreferences
        : {};
    const fromStylePrefs =
      draftStylePrefs?.miniWebsite && typeof draftStylePrefs.miniWebsite === 'object'
        ? draftStylePrefs.miniWebsite
        : null;
    const fromWebsite =
      rawPreview?.website && typeof rawPreview.website === 'object'
        ? rawPreview.website
        : null;
    return fromStylePrefs ?? fromWebsite ?? null;
  }

  async function ensureMiniWebsiteOnBusiness(businessId, draftMiniWebsite) {
    if (!draftMiniWebsite || !businessId) return;
    const existing = await prisma.business.findUnique({
      where: { id: businessId },
      select: { stylePreferences: true },
    });
    const existingPrefs =
      existing?.stylePreferences && typeof existing.stylePreferences === 'object'
        ? existing.stylePreferences
        : {};
    if (existingPrefs?.miniWebsite) return;
    await prisma.business.update({
      where: { id: businessId },
      data: {
        stylePreferences: { ...existingPrefs, miniWebsite: draftMiniWebsite },
      },
    });
  }

  const isTempStore = storeId === 'temp';
  let store = null;
  if (!isTempStore) {
    store = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, userId: true, name: true, slug: true },
    });
    if (!store) {
      throw new PublishDraftError('store_not_found', 'Store not found', 404);
    }
    if (store.userId !== userId) {
      throw new PublishDraftError('access_denied', 'You do not have permission to publish this store.', 403);
    }
  }

  let targetDraft = null;
  if (draftId && typeof draftId === 'string' && draftId.trim()) {
    targetDraft = await prisma.draftStore.findUnique({
      where: { id: draftId.trim() },
    });
    if (targetDraft && targetDraft.status === 'committed' && targetDraft.committedStoreId) {
      const existingStore = await prisma.business.findUnique({
        where: { id: targetDraft.committedStoreId },
        select: { id: true, userId: true, slug: true },
      });
      if (existingStore && existingStore.userId === userId) {
        // If a draft was previously published without miniWebsite, allow re-publish to backfill it.
        const rawPreview = typeof targetDraft.preview === 'string'
          ? JSON.parse(targetDraft.preview)
          : (targetDraft.preview || {});
        await ensureMiniWebsiteOnBusiness(existingStore.id, extractDraftMiniWebsite(rawPreview));
        return {
          storeId: existingStore.id,
          slug: existingStore.slug,
          storefrontUrl: `/app/store/${existingStore.id}`,
        };
      }
    }
    if (targetDraft && targetDraft.status && !['draft', 'generating', 'ready', 'error'].includes(targetDraft.status)) {
      targetDraft = null;
    }
  }
  if (!targetDraft) {
    targetDraft = await findTargetDraft(prisma, storeId, generationRunId);
  }
  if (!targetDraft) {
    throw new PublishDraftError('draft_not_found', 'No draft to publish. Please generate a draft first.', 404);
  }

  // Idempotent: if this draft is already committed, return the existing store (no duplicate business/store).
  if (targetDraft.status === 'committed' && targetDraft.committedStoreId) {
    const existingStore = await prisma.business.findUnique({
      where: { id: targetDraft.committedStoreId },
      select: { id: true, userId: true, slug: true },
    });
    if (existingStore && existingStore.userId === userId) {
      // If a draft was previously published without miniWebsite, allow re-publish to backfill it.
      const rawPreview = typeof targetDraft.preview === 'string'
        ? JSON.parse(targetDraft.preview)
        : (targetDraft.preview || {});
      await ensureMiniWebsiteOnBusiness(existingStore.id, extractDraftMiniWebsite(rawPreview));
      return {
        storeId: existingStore.id,
        slug: existingStore.slug,
        storefrontUrl: `/app/store/${existingStore.id}`,
      };
    }
  }

  // Tenant ownership: temp draft must belong to the authenticated user (via OrchestratorTask)
  if (isTempStore) {
    const runId = targetDraft.generationRunId
      || (typeof targetDraft.input === 'object' && targetDraft.input?.generationRunId)
      || (typeof targetDraft.input === 'string' && (() => { try { return JSON.parse(targetDraft.input)?.generationRunId; } catch { return null; } })());
    if (runId) {
      const owned = await isDraftOwnedByUser(runId, userId);
      if (!owned) {
        throw new PublishDraftError('access_denied', 'You do not have permission to publish this draft.', 403);
      }
    }
  }

  let effectiveStoreId = storeId;
  let reuseExistingBusiness = false;
  let existingBusinessForSafeUpdate = null;

  if (isTempStore && !store) {
    const rawUserId = userId;
    const isGuestId = typeof rawUserId === 'string' && rawUserId.startsWith('guest_');
    let publishUserId = null;

    if (isGuestId) {
      // Guests can publish in dev/test (auto-provisioned user). Production requires sign-in.
      if (process.env.NODE_ENV === 'production') {
        throw new PublishDraftError('AUTH_REQUIRED', 'Please sign in or create an account to publish your store.', 401);
      }
      const existingGuest = await prisma.user
        .findUnique({ where: { id: rawUserId }, select: { id: true } })
        .catch(() => null);
      if (!existingGuest) {
        await prisma.user.create({
          data: {
            id: rawUserId,
            email: `guest-${rawUserId}@cardbey.local`,
            passwordHash: 'guest',
            displayName: 'Guest',
            roles: '["viewer"]',
            role: 'viewer',
            emailVerified: false,
          },
        });
      }
      publishUserId = rawUserId;
    } else {
      const userExists = await prisma.user.findUnique({
        where: { id: rawUserId },
        select: { id: true },
      });
      if (!userExists) {
        throw new PublishDraftError('user_not_found', 'User not found. Please sign in again.', 401);
      }
      publishUserId = rawUserId;
    }

    // Multi-store: when publishing a temp draft, always create a NEW store (never reuse user's existing store).
    // Reusing caused "publish GIA DINH BAKERY" to overwrite/redirect to ABC Flowers when user already had one store.
    const previewForSlug = typeof targetDraft.preview === 'string' ? JSON.parse(targetDraft.preview) : (targetDraft.preview || {});
    const metaForSlug = previewForSlug?.meta || {};
    const storeNameForCreate = metaForSlug.storeName || previewForSlug.storeName || 'My Store';
    const storeTypeRawCreate = metaForSlug.storeType || previewForSlug.storeType || 'General';
    const storeTypeCreate = String(storeTypeRawCreate).trim().toLowerCase() || 'general';
    let slug = await generateUniqueStoreSlug(prisma, storeNameForCreate);
    const businessCreateData = {
      userId: publishUserId,
      name: storeNameForCreate,
      type: storeTypeCreate,
      slug,
      description: previewForSlug.description || previewForSlug.heroText || null,
      isActive: false,
    };
    let newBusiness;
    try {
      newBusiness = await prisma.business.create({
        data: businessCreateData,
      });
    } catch (createErr) {
      // P2002 = unique constraint (e.g. slug race). Retry once with a timestamped base so slug is guaranteed unique.
      if (createErr?.code === 'P2002') {
        const fallbackBase = `${storeNameForCreate}-${Date.now()}`;
        slug = await generateUniqueStoreSlug(prisma, fallbackBase);
        newBusiness = await prisma.business.create({
          data: { ...businessCreateData, slug },
        });
      } else {
        throw createErr;
      }
    }
    store = { id: newBusiness.id, userId: newBusiness.userId, name: newBusiness.name, slug: newBusiness.slug };
    effectiveStoreId = newBusiness.id;
  }

  const rawPreview = typeof targetDraft.preview === 'string'
    ? JSON.parse(targetDraft.preview)
    : (targetDraft.preview || {});
  const draftMiniWebsite = extractDraftMiniWebsite(rawPreview);

  // E2E guardrail: "Workflow Steps Are Immutable" — log when publish happens without preview step recorded
  const previewStepCompletedAt = rawPreview?.meta?.previewStepCompletedAt;
  if (!previewStepCompletedAt) {
    try {
      await prisma.auditEvent.create({
        data: {
          entityType: 'DraftStore',
          entityId: targetDraft.id,
          action: 'publish_without_preview_step_recorded',
          actorType: 'human',
          actorId: userId,
          reason: 'PREVIEW_STEP_NOT_RECORDED',
          metadata: { storeId, draftId: targetDraft.id },
        },
      });
    } catch (auditErr) {
      console.warn('[PublishDraft] AuditEvent publish_without_preview_step_recorded failed (non-fatal):', auditErr?.message);
    }
  }

  normalizePreviewCategories(rawPreview);

  const preview = parseDraftPreview(rawPreview);
  if (!preview) {
    throw new PublishDraftError('invalid_preview', 'Draft preview failed validation. Cannot publish.', 400);
  }

  // Use items first; fallback to catalog.products (frontend may store products there)
  const products = (Array.isArray(preview.items) && preview.items.length > 0)
    ? preview.items
    : (Array.isArray(rawPreview?.catalog?.products) ? rawPreview.catalog.products : []) || (preview.items ?? []);
  const categories = preview.categories ?? [];

  const draftCatIdToName = new Map();
  for (const c of categories) {
    if (c && c.id != null && (c.name != null || c.label != null)) {
      draftCatIdToName.set(String(c.id).trim(), String(c.name ?? c.label ?? '').trim() || 'Other');
    }
  }
  if (!draftCatIdToName.has('other')) {
    draftCatIdToName.set('other', 'Other');
  }
  const otherCategoryName = draftCatIdToName.get('other') ?? 'Other';
  const meta = preview.meta || {};
  const storeName = meta.storeName || preview.storeName || (store && store.name) || 'My Store';
  const storeTypeRaw = meta.storeType || preview.storeType || (store && store.type) || 'General';
  const storeType = String(storeTypeRaw).trim().toLowerCase() || 'general';
  const storeDescription = preview.description || preview.heroText || null;
  const storeLogo =
    meta.profileAvatarUrl ?? meta.logo
    ?? (preview.avatar && (preview.avatar.imageUrl ?? preview.avatar.url))
    ?? preview.avatarImageUrl
    ?? (preview.brand && preview.brand.logoUrl)
    ?? preview.logo
    ?? null;
  let storeHeroImage =
    meta.profileHeroUrl
    ?? (preview.hero && (preview.hero.imageUrl ?? preview.hero.url))
    ?? preview.heroImageUrl
    ?? meta.heroImage
    ?? preview.heroImage
    ?? null;
  const storeHeroVideo = meta.profileHeroVideoUrl ?? meta.heroVideo ?? preview.hero?.videoUrl ?? preview.heroVideo ?? null;
  let resolvedAvatarUrl = storeLogo == null
    ? null
    : typeof storeLogo === 'string'
      ? storeLogo
      : (storeLogo?.url ?? storeLogo?.imageUrl ?? null);

  // Deterministic fallback: first product image for hero/avatar when missing (same rule for preview + published)
  const firstProductImageUrl = (() => {
    if (!products || products.length === 0) return null;
    for (const p of products) {
      const url = p?.imageUrl ?? p?.image?.url ?? (typeof p?.image === 'string' ? p.image : null) ?? p?.primaryImageUrl ?? null;
      if (url && typeof url === 'string' && url.trim()) return url.trim();
    }
    return null;
  })();
  if (!storeHeroImage && firstProductImageUrl) storeHeroImage = firstProductImageUrl;
  if (!resolvedAvatarUrl && firstProductImageUrl) resolvedAvatarUrl = firstProductImageUrl;

  let newSlug = store && store.slug ? store.slug : await generateUniqueStoreSlug(prisma, storeName);
  if (store && store.name && storeName !== store.name) {
    newSlug = await generateUniqueStoreSlug(prisma, storeName);
  }

  const publishedAt = new Date();

  const BUSINESS_UPDATE_KEYS = [
    'name', 'type', 'slug', 'description', 'logo', 'isActive',
    'heroImageUrl', 'avatarImageUrl', 'publishedAt', 'stylePreferences', 'storefrontSettings', 'updatedAt',
  ];
  const existingStorefrontSettings = await loadExistingStorefrontSettings(prisma, effectiveStoreId);
  const draftStorefront = rawPreview.storefront && typeof rawPreview.storefront === 'object'
    ? rawPreview.storefront
    : {};
  const mergedStorefront = {
    ...existingStorefrontSettings,
    ...draftStorefront,
  };
  const storefrontSettings = {
    ...mergedStorefront,
    defaultView: (mergedStorefront.defaultView === 'list' || mergedStorefront.defaultView === 'grid')
      ? mergedStorefront.defaultView
      : 'grid',
    allowUserToggle: typeof mergedStorefront.allowUserToggle === 'boolean'
      ? mergedStorefront.allowUserToggle
      : true,
  };
  const rawBusinessData = {
    name: storeName,
    type: storeType,
    slug: newSlug,
    description: storeDescription,
    logo: storeLogo ? (typeof storeLogo === 'string' ? storeLogo : JSON.stringify(storeLogo)) : null,
    isActive: true,
    heroImageUrl: storeHeroImage || null,
    avatarImageUrl: resolvedAvatarUrl || null,
    publishedAt,
    stylePreferences: {
      ...(storeHeroImage ? { heroImage: storeHeroImage } : {}),
      ...(storeHeroVideo ? { heroVideo: storeHeroVideo } : {}),
      publishedAt: publishedAt.toISOString(),
      ...(draftMiniWebsite ? { miniWebsite: draftMiniWebsite } : {}),
    },
    ...(storefrontSettings !== undefined ? { storefrontSettings } : {}),
    updatedAt: publishedAt,
  };

  let businessData = Object.fromEntries(
    BUSINESS_UPDATE_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(rawBusinessData, k)).map((k) => [k, rawBusinessData[k]])
  );

  if (reuseExistingBusiness && existingBusinessForSafeUpdate) {
    const existing = existingBusinessForSafeUpdate;
    const keepKeys = ['name', 'type', 'slug', 'description', 'logo', 'heroImageUrl', 'avatarImageUrl'];
    for (const k of keepKeys) {
      const existingVal = existing[k];
      if (existingVal != null && existingVal !== '') {
        businessData[k] = existingVal;
      }
    }
  }

  /** Set after publish transaction — featured section ids remapped to real Product.id (draft uses idx_N / temp keys). */
  let remappedMiniWebsiteForPublish = null;

  await prisma.$transaction(async (tx) => {
    await tx.product.deleteMany({
      where: { businessId: effectiveStoreId },
    });

    /** @type {(string|undefined)[]} */
    const publishedIdsByDraftIndex = new Array(products.length);
    for (let i = 0; i < products.length; i++) {
      const productData = products[i];
      if (!productData.name || productData.name.trim().length === 0) continue;
      try {
        const price = productData.priceV1?.amount || productData.price || null;
        const normalizedPrice = price ? parseFloat(String(price).replace(/[^\d.]/g, '')) : null;
        const draftCatId = productData.categoryId != null ? String(productData.categoryId).trim() : null;
        const categoryName = (draftCatId && draftCatIdToName.get(draftCatId)) || draftCatIdToName.get('other') || productData.category || otherCategoryName;
        const created = await tx.product.create({
          data: {
            businessId: effectiveStoreId,
            name: productData.name.trim(),
            description: productData.description || null,
            price: normalizedPrice,
            currency: productData.currency || 'USD',
            category: categoryName || otherCategoryName,
            imageUrl: productData.imageUrl || productData.image || null,
            isPublished: true,
            viewCount: 0,
            likeCount: 0,
          },
        });
        publishedIdsByDraftIndex[i] = created.id;
      } catch (productError) {
        console.warn(`[publishDraft] Failed to create product "${productData.name}":`, productError.message);
      }
    }

    remappedMiniWebsiteForPublish =
      draftMiniWebsite && typeof draftMiniWebsite === 'object'
        ? remapMiniWebsiteFeaturedProductIds(draftMiniWebsite, products, publishedIdsByDraftIndex)
        : null;

    const stylePreferencesFinal = {
      ...(businessData.stylePreferences && typeof businessData.stylePreferences === 'object'
        ? businessData.stylePreferences
        : {}),
      ...(remappedMiniWebsiteForPublish ? { miniWebsite: remappedMiniWebsiteForPublish } : {}),
    };

    await tx.business.update({
      where: { id: effectiveStoreId },
      data: {
        ...businessData,
        stylePreferences: stylePreferencesFinal,
      },
    });

    await transitionDraftStoreStatus({
      prisma: tx,
      draftId: targetDraft.id,
      toStatus: 'committed',
      fromStatus: 'ready',
      actorType: 'human',
      actorId: userId,
      reason: 'PUBLISH',
      extraData: {
        committedAt: publishedAt,
        committedStoreId: effectiveStoreId,
        committedUserId: userId,
      },
    });

    try {
      await tx.activityEvent.create({
        data: {
          tenantId: userId,
          storeId: effectiveStoreId,
          userId,
          type: 'store_published',
          payload: {
            draftId: targetDraft.id,
            generationRunId: generationRunId || null,
            productsCount: products.length,
            categoriesCount: categories.length,
            publishedAt: publishedAt.toISOString(),
          },
          occurredAt: publishedAt,
        },
      });
    } catch (activityError) {
      console.warn('[publishDraft] Failed to create ActivityEvent (non-fatal):', activityError.message);
    }
  });

  // Ensure miniWebsite is set even if business already existed (idempotent re-publish backfill).
  await ensureMiniWebsiteOnBusiness(
    effectiveStoreId,
    remappedMiniWebsiteForPublish ?? draftMiniWebsite,
  );

  const storefrontUrl = `/app/store/${effectiveStoreId}`;
  const business = await prisma.business.findUnique({
    where: { id: effectiveStoreId },
    select: { slug: true },
  });
  refreshPersonalPresenceQrForBusiness(prisma, effectiveStoreId).catch((e) => {
    console.warn('[PublishDraft] refreshPersonalPresenceQrForBusiness failed (non-fatal):', e?.message || e);
  });
  return {
    storeId: effectiveStoreId,
    slug: business?.slug ?? newSlug,
    storefrontUrl,
  };
}
