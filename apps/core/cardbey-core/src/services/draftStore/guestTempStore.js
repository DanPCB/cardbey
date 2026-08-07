/**
 * Guest temp Business: lightweight store row for preview + analyze_store before sign-up.
 * Uses guest User row (Business.userId is required). Draft stays status "ready" (not committed).
 */

import { prisma } from '../../lib/prisma.js';
import { resolveTransactionCommerce } from '../../lib/storeTransactionMode.js';
import { normalizeStoreNameForDuplicateCheck } from '../../lib/intake/storeDuplicateDetection.js';
import { generateUniqueStoreSlug } from '../../utils/slug.js';
import {
  buildCategoryIdToNameMap,
  getDraft,
  normalizeDraftProductPrice,
  patchDraftPreview,
  resolveDraftItemImageUrl,
  resolveDraftProductCategoryName,
} from './draftStoreService.js';

/**
 * Ensure a guest_* JWT subject has a User row (required for Business.userId FK).
 * @param {string} guestUserId
 */
export async function ensureGuestUserRow(guestUserId) {
  const id = String(guestUserId ?? '').trim();
  if (!id || !id.toLowerCase().startsWith('guest_')) return false;
  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (existing) return true;
  await prisma.user.create({
    data: {
      id,
      email: `guest-${id.slice(0, 24)}@cardbey.local`,
      passwordHash: 'guest',
      displayName: 'Guest',
      roles: '["viewer"]',
      role: 'guest',
      emailVerified: false,
    },
  });
  return true;
}

function parseJsonField(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * Create (or return existing) guest temp Business linked to a ready draft.
 * @param {string} draftId
 * @param {{ userId: string, generationRunId?: string | null }} opts
 */
export async function createGuestTempStoreFromDraft(draftId, opts = {}) {
  const did = String(draftId ?? '').trim();
  const uid = String(opts.userId ?? '').trim();
  if (!did || !uid) throw new Error('draftId and userId are required');

  const draft = await getDraft(did);
  if (!draft) throw new Error(`Draft not found: ${did}`);
  const previewForReady = parseJsonField(draft.preview, {});
  const previewItems = Array.isArray(previewForReady.items)
    ? previewForReady.items
    : Array.isArray(previewForReady.catalog?.products)
      ? previewForReady.catalog.products
      : [];
  const draftReadyEnough =
    draft.status === 'ready' ||
    (draft.status === 'generating' && previewItems.length > 0);
  if (!draftReadyEnough) {
    throw new Error(`Draft not ready: ${draft.status}`);
  }

  const preview = parseJsonField(draft.preview, {});
  const draftInput = parseJsonField(draft.input, {});
  const meta = preview.meta && typeof preview.meta === 'object' ? { ...preview.meta } : {};
  const runIdEarly = opts.generationRunId || draft.generationRunId || draftInput.generationRunId || null;

  if (draft.committedStoreId) {
    const existing = await prisma.business.findUnique({
      where: { id: draft.committedStoreId },
      select: { id: true, slug: true },
    });
    if (existing) {
      return {
        storeId: existing.id,
        storeSlug: existing.slug,
        guestTempStore: true,
        guestSkippedCommit: false,
        draftId: did,
        generationRunId: runIdEarly,
        reusedExisting: true,
      };
    }
  }

  await ensureGuestUserRow(uid);

  const businessName =
    preview.storeName || meta.storeName || draftInput.businessName || draftInput.storeName || 'My Store';
  const businessType = preview.storeType || meta.storeType || draftInput.businessType || 'General';
  const location = draftInput.location || draftInput.suburb || '';
  const normalizedName = normalizeStoreNameForDuplicateCheck(businessName);

  // Reuse this guest's existing draft Business for the same store name (prevents chicken-food-2/-3).
  if (normalizedName) {
    const guestRows = await prisma.business.findMany({
      where: { userId: uid, isGuestDraft: true },
      select: { id: true, slug: true, name: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    const reusable = guestRows.find(
      (row) => normalizeStoreNameForDuplicateCheck(row?.name) === normalizedName,
    );
    if (reusable) {
      await prisma.business.update({
        where: { id: reusable.id },
        data: {
          name: String(businessName).slice(0, 200),
          type: String(businessType).slice(0, 80) || 'General',
          description: preview.heroText || preview.description || null,
          suburb: location ? String(location).slice(0, 120) : null,
          heroImageUrl: meta.profileHeroUrl || preview.heroImageUrl || null,
          avatarImageUrl: meta.profileAvatarUrl || preview.avatarImageUrl || null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      const business = { id: reusable.id, slug: reusable.slug };

      const commitItemsReuse = Array.isArray(preview.items)
        ? preview.items
        : Array.isArray(preview.catalog?.products)
          ? preview.catalog.products
          : [];
      const commitCategoryMapReuse = buildCategoryIdToNameMap(preview.categories ?? []);
      const otherCategoryNameReuse = commitCategoryMapReuse.get('other') ?? 'Other';
      const commitProductCurrencyReuse =
        (draftInput.currency != null && String(draftInput.currency).trim()
          ? String(draftInput.currency).trim().toUpperCase()
          : null) || 'AUD';

      await prisma.product.deleteMany({ where: { businessId: business.id } });
      for (const item of commitItemsReuse.slice(0, 100)) {
        if (!item || typeof item !== 'object') continue;
        const nameTrim = typeof item.name === 'string' ? item.name.trim() : '';
        if (!nameTrim) continue;
        try {
          const imageUrl = resolveDraftItemImageUrl(item);
          const categoryName = resolveDraftProductCategoryName(
            item,
            commitCategoryMapReuse,
            otherCategoryNameReuse,
          );
          const price = normalizeDraftProductPrice(item);
          await prisma.product.create({
            data: {
              businessId: business.id,
              name: nameTrim,
              description: item.description || null,
              price,
              currency:
                (item.currency != null && String(item.currency).trim()
                  ? String(item.currency).trim().toUpperCase()
                  : null) || commitProductCurrencyReuse,
              category: categoryName || otherCategoryNameReuse,
              imageUrl,
              isPublished: true,
              viewCount: 0,
              likeCount: 0,
            },
          });
        } catch (productError) {
          console.warn(
            `[guestTempStore] product refresh failed "${nameTrim}":`,
            productError?.message ?? productError,
          );
        }
      }

      await prisma.draftStore.update({
        where: { id: did },
        data: { committedStoreId: business.id },
      });
      await patchDraftPreview(did, {
        meta: {
          ...meta,
          guestTempStore: true,
          generationRunId: runIdEarly,
          storeId: business.id,
          storeSlug: business.slug,
          reusedGuestTempStore: true,
        },
      });

      console.log('[guestTempStore] reused existing guest temp business', {
        storeId: business.id,
        slug: business.slug,
        draftId: did,
        generationRunId: runIdEarly,
      });

      return {
        storeId: business.id,
        storeSlug: business.slug,
        guestTempStore: true,
        guestSkippedCommit: false,
        draftId: did,
        generationRunId: runIdEarly,
        reusedExisting: true,
      };
    }
  }

  const slugBase =
    opts.slugNameBase != null && String(opts.slugNameBase).trim()
      ? String(opts.slugNameBase).trim()
      : String(businessName);
  const slug = await generateUniqueStoreSlug(prisma, slugBase);
  const guestExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const commerce = resolveTransactionCommerce(businessType);
  const business = await prisma.business.create({
    data: {
      userId: uid,
      name: String(businessName).slice(0, 200),
      type: String(businessType).slice(0, 80) || 'General',
      transactionMode: commerce.transactionMode,
      catalogLabel: commerce.catalogLabel,
      ctaLabel: commerce.ctaLabel,
      slug,
      description: preview.heroText || preview.description || null,
      isActive: false,
      suburb: location ? String(location).slice(0, 120) : null,
      heroImageUrl: meta.profileHeroUrl || preview.heroImageUrl || null,
      avatarImageUrl: meta.profileAvatarUrl || preview.avatarImageUrl || null,
      isGuestDraft: true,
      expiresAt: guestExpiresAt,
    },
  });

  const commitItems = Array.isArray(preview.items)
    ? preview.items
    : Array.isArray(preview.catalog?.products)
      ? preview.catalog.products
      : [];
  const commitCategoryMap = buildCategoryIdToNameMap(preview.categories ?? []);
  const otherCategoryName = commitCategoryMap.get('other') ?? 'Other';
  const commitProductCurrency =
    (draftInput.currency != null && String(draftInput.currency).trim()
      ? String(draftInput.currency).trim().toUpperCase()
      : null) || 'AUD';

  await prisma.product.deleteMany({ where: { businessId: business.id } });
  for (const item of commitItems.slice(0, 100)) {
    if (!item || typeof item !== 'object') continue;
    const nameTrim = typeof item.name === 'string' ? item.name.trim() : '';
    if (!nameTrim) continue;
    try {
      const imageUrl = resolveDraftItemImageUrl(item);
      const categoryName = resolveDraftProductCategoryName(item, commitCategoryMap, otherCategoryName);
      const price = normalizeDraftProductPrice(item);
      await prisma.product.create({
        data: {
          businessId: business.id,
          name: nameTrim,
          description: item.description || null,
          price,
          currency:
            (item.currency != null && String(item.currency).trim()
              ? String(item.currency).trim().toUpperCase()
              : null) || commitProductCurrency,
          category: categoryName || otherCategoryName,
          imageUrl,
          isPublished: true,
          viewCount: 0,
          likeCount: 0,
        },
      });
    } catch (productError) {
      console.warn(`[guestTempStore] product create failed "${nameTrim}":`, productError?.message ?? productError);
    }
  }

  const runId = opts.generationRunId || draft.generationRunId || draftInput.generationRunId || null;
  await prisma.draftStore.update({
    where: { id: did },
    data: { committedStoreId: business.id },
  });
  await patchDraftPreview(did, {
    meta: {
      ...meta,
      guestTempStore: true,
      generationRunId: runId,
      storeId: business.id,
      storeSlug: business.slug,
    },
  });

  console.log('[guestTempStore] created temp business for guest', {
    storeId: business.id,
    slug: business.slug,
    draftId: did,
    generationRunId: runId,
  });

  return {
    storeId: business.id,
    storeSlug: business.slug,
    guestTempStore: true,
    guestSkippedCommit: false,
    draftId: did,
    generationRunId: runId,
  };
}

/**
 * Transfer guest temp store ownership to authenticated user.
 * @param {string} storeId
 * @param {string} newUserId
 */
export async function claimGuestTempStoreForUser(storeId, newUserId) {
  const sid = String(storeId ?? '').trim();
  const uid = String(newUserId ?? '').trim();
  if (!sid || !uid) throw new Error('storeId and userId are required');

  const store = await prisma.business.findUnique({ where: { id: sid } });
  if (!store) {
    const err = new Error('Store not found');
    err.code = 'not_found';
    throw err;
  }

  const draft = await prisma.draftStore.findFirst({
    where: { committedStoreId: sid },
    select: { id: true, ownerUserId: true, preview: true },
  });

  const preview = draft ? parseJsonField(draft.preview, {}) : {};
  const meta = preview.meta && typeof preview.meta === 'object' ? preview.meta : {};
  const isGuestTemp =
    store.isGuestDraft === true ||
    meta.guestTempStore === true ||
    (typeof store.userId === 'string' && store.userId.toLowerCase().startsWith('guest_'));

  if (!isGuestTemp) {
    const err = new Error('Not a guest temp store');
    err.code = 'not_guest_temp';
    throw err;
  }

  await prisma.business.update({
    where: { id: sid },
    data: {
      userId: uid,
      isGuestDraft: false,
      expiresAt: null,
    },
  });

  if (draft) {
    await prisma.draftStore.update({
      where: { id: draft.id },
      data: { ownerUserId: uid },
    });
    await patchDraftPreview(draft.id, {
      meta: { ...meta, guestTempStore: false, claimedAt: new Date().toISOString() },
    });
  }

  try {
    const { collectMissionIdsForStoreClaim, normalizeMissionOwnershipForUser } = await import(
      '../../lib/missionOwnership.js'
    );
    const missionIds = await collectMissionIdsForStoreClaim(prisma, { storeId: sid, draft });
    for (const missionId of missionIds) {
      await normalizeMissionOwnershipForUser(prisma, missionId, uid, { tenantId: uid });
    }
    if (missionIds.length) {
      console.log('[claim-guest] mission ownership normalized:', { storeId: sid, missionIds });
    }
  } catch (err) {
    console.warn('[claim-guest] mission ownership normalize failed:', err?.message || err);
  }

  console.log('[claim-guest] store claimed:', { storeId: sid, userId: uid });
  return { storeId: sid };
}
