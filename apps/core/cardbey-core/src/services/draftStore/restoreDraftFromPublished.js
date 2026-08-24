/**
 * Rebuild draft.preview from the live published Business (products + stylePreferences).
 * Used by POST /api/draft-store/:draftId/restore-from-published.
 * Does not publish — only resets the editable draft to match live.
 */

import { slugify } from '../../utils/slug.js';
import { normalizePreviewCategories } from './draftStoreService.js';
import {
  resolveCanonicalHeroMediaFromPreview,
  writeCanonicalHeroMediaToPreview,
} from './draftPreviewHeroSync.js';
import { buildDraftPublishState } from './buildDraftPublishState.js';
import {
  isPublishSnapshotV1Enabled,
  refreshPublishSnapshotFromCurrentPreview,
} from './publishSnapshotService.js';

function parseStylePreferences(raw) {
  if (!raw) return {};
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

function catKey(name) {
  return (name && slugify(String(name).trim())) || 'other';
}

/**
 * @param {import('../../lib/prisma.js').PrismaClient} prisma
 * @param {string} storeId
 */
export async function buildPreviewFromPublishedBusiness(prisma, storeId) {
  const business = await prisma.business.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      type: true,
      description: true,
      logo: true,
      primaryColor: true,
      secondaryColor: true,
      tagline: true,
      heroText: true,
      heroImageUrl: true,
      avatarImageUrl: true,
      stylePreferences: true,
      publishedAt: true,
      isActive: true,
      slug: true,
    },
  });
  if (!business) {
    const err = new Error('Store not found');
    err.code = 'store_not_found';
    err.statusCode = 404;
    throw err;
  }
  if (!business.publishedAt || !business.isActive || !business.slug) {
    const err = new Error('Store is not live published');
    err.code = 'store_not_live';
    err.statusCode = 400;
    throw err;
  }

  const products = await prisma.product.findMany({
    where: { businessId: storeId, deletedAt: null },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      category: true,
      imageUrl: true,
    },
  });

  const catNames = [
    ...new Set(
      products
        .map((p) => (p.category && String(p.category).trim()) || null)
        .filter(Boolean),
    ),
  ];
  const categories = catNames.length
    ? catNames.map((name) => ({ id: catKey(name), name: String(name).trim() }))
    : [];
  if (!categories.some((c) => c.id === 'other')) {
    categories.push({ id: 'other', name: 'Other' });
  }

  const items = products.map((p) => {
    const catName = p.category ?? null;
    return {
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      price: p.price != null ? p.price : null,
      category: catName,
      categoryId: catKey(catName),
      imageUrl: p.imageUrl ?? null,
    };
  });

  const sp = parseStylePreferences(business.stylePreferences);
  let heroImageUrl =
    (typeof business.heroImageUrl === 'string' && business.heroImageUrl.trim()) ||
    (typeof sp.heroImage === 'string' && sp.heroImage.trim()) ||
    (typeof sp.heroImageUrl === 'string' && sp.heroImageUrl.trim()) ||
    null;
  let heroVideoUrl =
    (typeof sp.heroVideo === 'string' && sp.heroVideo.trim()) ||
    (typeof sp.heroVideoUrl === 'string' && sp.heroVideoUrl.trim()) ||
    null;
  let avatarUrl =
    (typeof business.avatarImageUrl === 'string' && business.avatarImageUrl.trim()) ||
    (typeof sp.profileAvatarUrl === 'string' && sp.profileAvatarUrl.trim()) ||
    (typeof sp.avatarUrl === 'string' && sp.avatarUrl.trim()) ||
    null;

  if (business.logo) {
    try {
      const logoData = typeof business.logo === 'string' ? JSON.parse(business.logo) : business.logo;
      if (!avatarUrl) avatarUrl = logoData?.avatarUrl ?? logoData?.url ?? null;
      if (!heroImageUrl) {
        heroImageUrl =
          logoData?.bannerUrl ?? logoData?.heroUrl ?? logoData?.coverUrl ?? avatarUrl ?? null;
      }
    } catch {
      if (!avatarUrl && typeof business.logo === 'string') avatarUrl = business.logo;
      if (!heroImageUrl && typeof business.logo === 'string') heroImageUrl = business.logo;
    }
  }

  const preview = {
    storeName: business.name || 'My Store',
    storeType: business.type || 'General',
    slogan: business.tagline ?? business.description ?? null,
    heroText: business.heroText ?? business.description ?? null,
    categories,
    items,
    brandColors: {
      primary: business.primaryColor || '#6366f1',
      secondary: business.secondaryColor || '#8b5cf6',
    },
    meta: {
      storeId,
      storeName: business.name,
      storeType: business.type,
      restoredFromPublishedAt: new Date().toISOString(),
    },
  };

  if (sp.miniWebsite && typeof sp.miniWebsite === 'object') {
    preview.website = sp.miniWebsite;
  }
  if (sp.theme && typeof sp.theme === 'object') {
    preview.theme = sp.theme;
  }

  const heroSeed = {};
  if (heroVideoUrl) {
    heroSeed.heroVideoUrl = heroVideoUrl;
    heroSeed.heroVideo = heroVideoUrl;
    heroSeed.heroMediaType = 'video';
    if (heroImageUrl) heroSeed.heroImageUrl = heroImageUrl;
  } else if (heroImageUrl) {
    heroSeed.heroImageUrl = heroImageUrl;
    heroSeed.heroMediaType = 'image';
    heroSeed.hero = { imageUrl: heroImageUrl, url: heroImageUrl };
  }
  if (Object.keys(heroSeed).length) {
    const canonical = resolveCanonicalHeroMediaFromPreview(heroSeed);
    writeCanonicalHeroMediaToPreview(preview, canonical);
  }

  if (avatarUrl) {
    preview.avatar = { imageUrl: avatarUrl, url: avatarUrl };
    preview.avatarImageUrl = avatarUrl;
  }

  normalizePreviewCategories(preview);
  return preview;
}

/**
 * @param {import('../../lib/prisma.js').PrismaClient} prisma
 * @param {{ draftId: string }} args
 */
export async function restoreDraftFromPublished(prisma, { draftId }) {
  const draft = await prisma.draftStore.findUnique({ where: { id: draftId } });
  if (!draft) {
    const err = new Error('Draft store not found or expired');
    err.code = 'draft_not_found';
    err.statusCode = 404;
    throw err;
  }
  const storeId =
    typeof draft.committedStoreId === 'string' && draft.committedStoreId.trim()
      ? draft.committedStoreId.trim()
      : null;
  if (!storeId) {
    const err = new Error('Draft is not linked to a published store');
    err.code = 'draft_not_committed';
    err.statusCode = 400;
    throw err;
  }

  const preview = await buildPreviewFromPublishedBusiness(prisma, storeId);

  const updated = await prisma.draftStore.update({
    where: { id: draftId },
    data: {
      preview,
      updatedAt: new Date(),
    },
  });

  if (isPublishSnapshotV1Enabled()) {
    try {
      await refreshPublishSnapshotFromCurrentPreview(prisma, draftId);
    } catch (e) {
      console.warn(
        '[restoreDraftFromPublished] publish snapshot refresh failed (non-fatal):',
        e?.message || e,
      );
    }
  }

  const publishState = await buildDraftPublishState(prisma, updated);
  return {
    draftId: updated.id,
    status: updated.status,
    preview: updated.preview,
    publishState,
  };
}
