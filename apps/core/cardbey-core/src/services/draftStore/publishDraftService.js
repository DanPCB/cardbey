/**
 * Publish Draft Service
 * Core logic to publish a draft store to Business + Products. Used by POST /api/stores/publish and POST /api/automation/store-from-input.
 *
 * Idempotency and multi-store:
 * - If the draft is already committed (status === 'committed', committedStoreId set), returns the existing store without creating a new Business.
 * - When storeId === 'temp', reuse an existing Business for the same owner + slug when present (no duplicate slug per tenant).
 * Verification: Publish same draft twice -> second call returns same store. Guest draft -> sign in -> publish works. User with existing store(s) publishing temp draft -> new store created.
 */

import { generateUniqueStoreSlug, generateUniqueStoreSlugForTx, slugify } from '../../utils/slug.js';
import { extendedBusinessFieldsFromCommerce } from '../../lib/dbCapabilities.js';
import { resolveTransactionCommerce } from '../../lib/storeTransactionMode.js';
import { parseDraftPreview } from './draftPreviewSchema.js';
import { normalizePreviewCategories, buildCategoryIdToNameMap, resolveDraftProductCategoryName, resolveDraftItemImageUrl, normalizeDraftProductPrice } from './draftStoreService.js';
import {
  readCanonicalHeroFromPreview,
  resolveMiniWebsiteForPublish,
} from './draftPreviewHeroSync.js';
import {
  logPublishCanonicalTarget,
  logPublishEntry,
  logPublishRunway,
  resolvePublishedStoreCopyFromPreview,
} from './publishRunway.js';
import { buildPersistAndApplyPublishedProjection } from '../publishedArtifactProjection/publishProjectionHooks.js';

const BUSINESS_PUBLISH_SCALAR_KEYS = new Set([
  'name',
  'type',
  'slug',
  'description',
  'tagline',
  'logo',
  'isActive',
  'heroImageUrl',
  'avatarImageUrl',
  'publishedAt',
  'stylePreferences',
  'storefrontSettings',
  'updatedAt',
  'transactionMode',
  'catalogLabel',
  'ctaLabel',
]);

function parseStylePreferencesBlob(raw) {
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

async function loadExistingStylePreferences(prisma, businessId) {
  if (!businessId) return {};
  const row = await prisma.business.findUnique({
    where: { id: businessId },
    select: { stylePreferences: true },
  });
  return parseStylePreferencesBlob(row?.stylePreferences);
}

/** Prisma Business has no heroVideo column — keep video URL inside stylePreferences JSON only. */
function sanitizeBusinessPublishData(data) {
  const out = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (key === 'heroVideo' || key === 'heroVideoUrl') continue;
    if (!BUSINESS_PUBLISH_SCALAR_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

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

/** GET /api/public/stores/:slug only returns rows with isActive === true. */
async function ensureBusinessPubliclyVisible(prisma, businessId, publishedAt = new Date()) {
  const id = businessId != null ? String(businessId).trim() : '';
  if (!id) return;
  const row = await prisma.business.findUnique({
    where: { id },
    select: { isActive: true, publishedAt: true },
  });
  if (!row) return;
  if (row.isActive === true && row.publishedAt) return;
  await prisma.business.update({
    where: { id },
    data: {
      isActive: true,
      publishedAt: row.publishedAt ?? publishedAt,
      updatedAt: publishedAt,
    },
  });
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
 * @param {import('../../lib/prismaClient.js').PrismaClient} prisma
 * @param {{ storeId: string, generationRunId?: string, draftId?: string, userId: string, entrypoint?: string }} params
 * @returns {Promise<{ storeId: string, slug: string, storefrontUrl: string }>}
 * @throws {PublishDraftError} DRAFT_NOT_FOUND, AUTH_REQUIRED, etc.
 */
export async function publishDraft(prisma, {
  storeId,
  generationRunId,
  draftId,
  userId,
  entrypoint = 'unknown',
}) {
  if (!userId) {
    throw new PublishDraftError('AUTH_REQUIRED', 'Authentication required to publish a store.', 401);
  }

  logPublishEntry(entrypoint, {
    storeId,
    draftId: draftId ?? null,
    generationRunId: generationRunId ?? null,
    userId,
  });

  /** Re-publish / idempotent: apply latest draft hero + miniWebsite and ensure public listing. */
  async function syncPublishedStoreFromDraft(businessId, rawPreview, publishedAt = new Date()) {
    const id = String(businessId ?? '').trim();
    if (!id) return;

    const { heroImage, heroVideo } = readCanonicalHeroFromPreview(rawPreview);
    const miniWebsite = resolveMiniWebsiteForPublish(rawPreview);

    const meta =
      rawPreview?.meta && typeof rawPreview.meta === 'object' ? rawPreview.meta : {};
    const storeLogo =
      meta.profileAvatarUrl ??
      meta.logo ??
      (rawPreview?.avatar && (rawPreview.avatar.imageUrl ?? rawPreview.avatar.url)) ??
      rawPreview?.avatarImageUrl ??
      (rawPreview?.brand && rawPreview.brand.logoUrl) ??
      rawPreview?.logo ??
      null;
    const resolvedAvatarUrl =
      storeLogo == null
        ? null
        : typeof storeLogo === 'string'
          ? storeLogo
          : (storeLogo?.url ?? storeLogo?.imageUrl ?? null);

    const existing = await prisma.business.findUnique({
      where: { id },
      select: { stylePreferences: true, heroImageUrl: true, avatarImageUrl: true, publishedAt: true },
    });
    if (!existing) return;

    const existingPrefs = parseStylePreferencesBlob(existing.stylePreferences);
    const heroUrlForColumn = heroVideo || heroImage || existing.heroImageUrl;
    const { tagline, description } = resolvePublishedStoreCopyFromPreview(rawPreview);

    const stylePreferences = {
      ...existingPrefs,
      ...(heroImage ? { heroImage } : {}),
      ...(heroVideo ? { heroVideo } : {}),
      ...(miniWebsite ? { miniWebsite } : {}),
      publishedAt: existingPrefs.publishedAt ?? publishedAt.toISOString(),
    };

    await prisma.business.update({
      where: { id },
      data: sanitizeBusinessPublishData({
        isActive: true,
        publishedAt: existing.publishedAt ?? publishedAt,
        heroImageUrl: heroUrlForColumn || null,
        ...(resolvedAvatarUrl ? { avatarImageUrl: resolvedAvatarUrl } : {}),
        ...(tagline ? { tagline } : {}),
        ...(description ? { description } : {}),
        stylePreferences,
        updatedAt: publishedAt,
      }),
    });
    logPublishRunway('STORE_CARD_SYNC', { businessId: id, slug: null, tagline, description });
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

  const explicitDraftId =
    draftId && typeof draftId === 'string' && draftId.trim() ? draftId.trim() : null;

  let targetDraft = null;
  if (explicitDraftId) {
    targetDraft = await prisma.draftStore.findUnique({
      where: { id: explicitDraftId },
    });
    if (targetDraft && targetDraft.status === 'committed' && targetDraft.committedStoreId) {
      const existingStore = await prisma.business.findUnique({
        where: { id: targetDraft.committedStoreId },
        select: { id: true, userId: true, slug: true },
      });
      if (existingStore && existingStore.userId === userId) {
        const freshDraft = await prisma.draftStore.findUnique({ where: { id: targetDraft.id } });
        if (freshDraft) targetDraft = freshDraft;
        const rawPreview = typeof targetDraft.preview === 'string'
          ? JSON.parse(targetDraft.preview)
          : (targetDraft.preview || {});
        await syncPublishedStoreFromDraft(existingStore.id, rawPreview);
        await ensureBusinessPubliclyVisible(prisma, existingStore.id);
        return {
          storeId: existingStore.id,
          slug: existingStore.slug,
          storefrontUrl: `/app/store/${existingStore.id}`,
        };
      }
    }
    if (
      !explicitDraftId &&
      targetDraft &&
      targetDraft.status &&
      !['draft', 'generating', 'ready', 'error', 'committed'].includes(targetDraft.status)
    ) {
      targetDraft = null;
    }
  }
  if (!targetDraft) {
    if (explicitDraftId) {
      throw new PublishDraftError('draft_not_found', 'Draft not found. Please refresh the preview and try again.', 404);
    }
    targetDraft = await findTargetDraft(prisma, storeId, generationRunId);
  }
  if (!targetDraft) {
    throw new PublishDraftError('draft_not_found', 'No draft to publish. Please generate a draft first.', 404);
  }

  // Always read the latest persisted draft (hero edits may have landed just before publish).
  const freshDraftRow = await prisma.draftStore.findUnique({ where: { id: targetDraft.id } });
  if (freshDraftRow) targetDraft = freshDraftRow;

  // Idempotent: if this draft is already committed, return the existing store (no duplicate business/store).
  if (targetDraft.status === 'committed' && targetDraft.committedStoreId) {
    const existingStore = await prisma.business.findUnique({
      where: { id: targetDraft.committedStoreId },
      select: { id: true, userId: true, slug: true },
    });
    if (existingStore && existingStore.userId === userId) {
      const rawPreview = typeof targetDraft.preview === 'string'
        ? JSON.parse(targetDraft.preview)
        : (targetDraft.preview || {});
      await syncPublishedStoreFromDraft(existingStore.id, rawPreview);
      await ensureBusinessPubliclyVisible(prisma, existingStore.id);
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

  let effectiveStoreId = isTempStore ? null : storeId;
  let reuseExistingBusiness = false;
  let existingBusinessForSafeUpdate = null;
  /** Set when publishing storeId === 'temp' — Business row is created inside the publish transaction. */
  let publishUserIdForTemp = null;

  if (isTempStore && !store) {
    const rawUserId = userId;
    const isGuestId = typeof rawUserId === 'string' && rawUserId.startsWith('guest_');

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
      publishUserIdForTemp = rawUserId;
    } else {
      const userExists = await prisma.user.findUnique({
        where: { id: rawUserId },
        select: { id: true },
      });
      if (!userExists) {
        throw new PublishDraftError('user_not_found', 'User not found. Please sign in again.', 401);
      }
      publishUserIdForTemp = rawUserId;
    }
  }

  const rawPreview = typeof targetDraft.preview === 'string'
    ? JSON.parse(targetDraft.preview)
    : (targetDraft.preview || {});
  const draftMiniWebsite = resolveMiniWebsiteForPublish(rawPreview);

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

  const draftCatIdToName = buildCategoryIdToNameMap(categories);
  const otherCategoryName = draftCatIdToName.get('other') ?? 'Other';
  const meta = preview.meta || {};
  const storeName = meta.storeName || preview.storeName || (store && store.name) || 'My Store';
  const storeTypeRaw = meta.storeType || preview.storeType || (store && store.type) || 'General';
  const storeType = String(storeTypeRaw).trim().toLowerCase() || 'general';
  const { tagline: storeTagline, description: storeDescription } = resolvePublishedStoreCopyFromPreview(
    rawPreview,
    preview,
  );
  const storeLogo =
    meta.profileAvatarUrl ?? meta.logo
    ?? (preview.avatar && (preview.avatar.imageUrl ?? preview.avatar.url))
    ?? preview.avatarImageUrl
    ?? (preview.brand && preview.brand.logoUrl)
    ?? preview.logo
    ?? null;
  const canonicalHero = readCanonicalHeroFromPreview(rawPreview);
  let storeHeroImage = canonicalHero.heroImage;
  const storeHeroVideo = canonicalHero.heroVideo;
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

  /** For temp drafts the Business row is created in the transaction — slug is assigned there (avoids orphan slug reservations). */
  let newSlug = store?.slug ?? null;
  if (!isTempStore) {
    if (!newSlug) {
      newSlug = await generateUniqueStoreSlug(prisma, storeName);
    }
    if (store?.name && storeName !== store.name) {
      newSlug = await generateUniqueStoreSlug(prisma, storeName);
    }
  }

  const publishedAt = new Date();

  const BUSINESS_UPDATE_KEYS = [
    'name', 'type', 'slug', 'description', 'tagline', 'logo', 'isActive',
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
  const commerce = resolveTransactionCommerce(storeType);
  const storefrontSettings = {
    ...mergedStorefront,
    defaultView: (mergedStorefront.defaultView === 'list' || mergedStorefront.defaultView === 'grid')
      ? mergedStorefront.defaultView
      : 'grid',
    allowUserToggle: typeof mergedStorefront.allowUserToggle === 'boolean'
      ? mergedStorefront.allowUserToggle
      : true,
    cta: {
      ...(mergedStorefront.cta && typeof mergedStorefront.cta === 'object' ? mergedStorefront.cta : {}),
      label: commerce.ctaLabel,
      action: commerce.ctaAction,
    },
  };
  const rawBusinessData = {
    name: storeName,
    type: storeType,
    slug: newSlug,
    description: storeDescription,
    tagline: storeTagline,
    logo: storeLogo ? (typeof storeLogo === 'string' ? storeLogo : JSON.stringify(storeLogo)) : null,
    isActive: true,
    heroImageUrl: storeHeroImage || storeHeroVideo || null,
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
    ...extendedBusinessFieldsFromCommerce(commerce),
  };

  let businessData = sanitizeBusinessPublishData(
    Object.fromEntries(
      BUSINESS_UPDATE_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(rawBusinessData, k)).map((k) => [
        k,
        rawBusinessData[k],
      ]),
    ),
  );

  if (reuseExistingBusiness && existingBusinessForSafeUpdate) {
    const existing = existingBusinessForSafeUpdate;
    const keepKeys = ['name', 'type', 'slug', 'description', 'logo'];
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
    if (isTempStore && !effectiveStoreId) {
      const ownerId = publishUserIdForTemp;
      if (!ownerId) {
        throw new PublishDraftError('AUTH_REQUIRED', 'Authentication required to publish a store.', 401);
      }

      const intendedSlug = slugify(storeName);
      let matchedBusiness = null;

      if (targetDraft.committedStoreId) {
        matchedBusiness = await tx.business.findFirst({
          where: { id: targetDraft.committedStoreId, userId: ownerId },
          select: { id: true, userId: true, name: true, slug: true },
        });
        if (matchedBusiness) {
          logPublishRunway('STORE_UPSERT_MATCH', {
            reason: 'draft_committed_store_id',
            businessId: matchedBusiness.id,
            slug: matchedBusiness.slug,
            tenantId: ownerId,
            draftId: targetDraft.id,
          });
        }
      }

      if (!matchedBusiness && intendedSlug) {
        matchedBusiness = await tx.business.findFirst({
          where: { userId: ownerId, slug: intendedSlug },
          select: { id: true, userId: true, name: true, slug: true },
        });
        if (matchedBusiness) {
          logPublishRunway('STORE_UPSERT_MATCH', {
            reason: 'tenant_slug',
            businessId: matchedBusiness.id,
            slug: matchedBusiness.slug,
            tenantId: ownerId,
            draftId: targetDraft.id,
          });
        }
      }

      if (matchedBusiness) {
        effectiveStoreId = matchedBusiness.id;
        store = {
          id: matchedBusiness.id,
          userId: matchedBusiness.userId,
          name: matchedBusiness.name,
          slug: matchedBusiness.slug,
        };
        newSlug = matchedBusiness.slug;
        logPublishRunway('STORE_UPSERT_UPDATE', {
          businessId: matchedBusiness.id,
          slug: matchedBusiness.slug,
          tenantId: ownerId,
          draftId: targetDraft.id,
        });
        logPublishRunway('DUPLICATE_STORE_PREVENTED', {
          businessId: matchedBusiness.id,
          slug: matchedBusiness.slug,
          tenantId: ownerId,
          draftId: targetDraft.id,
        });
      } else {
        let slugForCreate = await generateUniqueStoreSlugForTx(tx, storeName);
        let createdBusiness;
        try {
          createdBusiness = await tx.business.create({
            data: {
              userId: ownerId,
              name: storeName,
              type: storeType,
              slug: slugForCreate,
              description: storeDescription,
              tagline: storeTagline,
              isActive: false,
            },
          });
        } catch (createErr) {
          if (createErr?.code === 'P2002') {
            const retrySlug = intendedSlug
              ? await tx.business.findFirst({
                  where: { userId: ownerId, slug: intendedSlug },
                  select: { id: true, userId: true, name: true, slug: true },
                })
              : null;
            if (retrySlug) {
              createdBusiness = retrySlug;
              logPublishRunway('STORE_UPSERT_MATCH', {
                reason: 'slug_unique_race',
                businessId: retrySlug.id,
                slug: retrySlug.slug,
                tenantId: ownerId,
              });
            } else {
              slugForCreate = await generateUniqueStoreSlugForTx(tx, `${storeName}-${Date.now()}`);
              createdBusiness = await tx.business.create({
                data: {
                  userId: ownerId,
                  name: storeName,
                  type: storeType,
                  slug: slugForCreate,
                  description: storeDescription,
                  tagline: storeTagline,
                  isActive: false,
                },
              });
            }
          } else {
            throw createErr;
          }
        }
        effectiveStoreId = createdBusiness.id;
        store = {
          id: createdBusiness.id,
          userId: createdBusiness.userId,
          name: createdBusiness.name,
          slug: createdBusiness.slug,
        };
        newSlug = createdBusiness.slug;
        logPublishRunway('STORE_UPSERT_CREATE', {
          businessId: createdBusiness.id,
          slug: createdBusiness.slug,
          tenantId: ownerId,
          draftId: targetDraft.id,
        });
      }
    }

    await tx.product.deleteMany({
      where: { businessId: effectiveStoreId },
    });

    /** @type {(string|undefined)[]} */
    const publishedIdsByDraftIndex = new Array(products.length);
    for (let i = 0; i < products.length; i++) {
      const productData = products[i];
      if (!productData.name || productData.name.trim().length === 0) continue;
      try {
        const normalizedPrice = normalizeDraftProductPrice(productData);
        const categoryName = resolveDraftProductCategoryName(productData, draftCatIdToName, otherCategoryName);
        const imageUrl = resolveDraftItemImageUrl(productData);
        const created = await tx.product.create({
          data: {
            businessId: effectiveStoreId,
            name: productData.name.trim(),
            description: productData.description || null,
            price: normalizedPrice,
            currency: productData.currency || 'USD',
            category: categoryName || otherCategoryName,
            imageUrl,
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

    const existingStylePrefs = await loadExistingStylePreferences(tx, effectiveStoreId);
    const stylePreferencesFinal = {
      ...existingStylePrefs,
      ...(businessData.stylePreferences && typeof businessData.stylePreferences === 'object'
        ? businessData.stylePreferences
        : {}),
      ...(remappedMiniWebsiteForPublish ? { miniWebsite: remappedMiniWebsiteForPublish } : {}),
      ...(storeHeroVideo ? { heroVideo: storeHeroVideo } : {}),
      ...(storeHeroImage ? { heroImage: storeHeroImage } : {}),
    };

    const slugForUpdate = newSlug ?? store?.slug ?? businessData.slug;
    if (slugForUpdate) {
      businessData.slug = slugForUpdate;
    }

    await tx.business.update({
      where: { id: effectiveStoreId },
      data: sanitizeBusinessPublishData({
        ...businessData,
        stylePreferences: stylePreferencesFinal,
      }),
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

  const rawPreviewForSync = {
    ...rawPreview,
    ...(remappedMiniWebsiteForPublish
      ? { website: remappedMiniWebsiteForPublish }
      : {}),
  };
  await syncPublishedStoreFromDraft(effectiveStoreId, rawPreviewForSync, publishedAt);
  await ensureBusinessPubliclyVisible(prisma, effectiveStoreId, publishedAt);

  await buildPersistAndApplyPublishedProjection(prisma, {
    businessId: effectiveStoreId,
    tenantId: userId,
    draft: targetDraft,
    draftPreview: rawPreviewForSync,
    publishRunId: targetDraft.id,
    source: entrypoint ?? 'publishDraft',
  });

  const business = await prisma.business.findUnique({
    where: { id: effectiveStoreId },
    select: { slug: true, isActive: true, publishedAt: true },
  });
  if (!business?.isActive) {
    throw new PublishDraftError(
      'publish_not_active',
      'Store publish did not activate the public listing. Please try publishing again.',
      500,
    );
  }

  logPublishCanonicalTarget({
    businessId: effectiveStoreId,
    slug: business?.slug ?? newSlug,
    draftId: targetDraft.id,
    tenantId: userId,
    entrypoint,
  });
  logPublishRunway('STORE_CARD_SYNC', {
    businessId: effectiveStoreId,
    slug: business?.slug ?? newSlug,
    tagline: storeTagline,
    description: storeDescription,
  });

  if (process.env.NODE_ENV !== 'test') {
    console.log('[publishDraft] store published', {
      storeId: effectiveStoreId,
      slug: business.slug,
      isActive: business.isActive,
      publishedAt: business.publishedAt,
      draftId: targetDraft.id,
      entrypoint,
    });
  }

  const storefrontUrl = `/app/store/${effectiveStoreId}`;
  refreshPersonalPresenceQrForBusiness(prisma, effectiveStoreId).catch((e) => {
    console.warn('[PublishDraft] refreshPersonalPresenceQrForBusiness failed (non-fatal):', e?.message || e);
  });
  return {
    storeId: effectiveStoreId,
    slug: business?.slug ?? newSlug,
    storefrontUrl,
  };
}
