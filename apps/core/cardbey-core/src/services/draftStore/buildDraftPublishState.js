/**
 * Publish workflow metadata for draft website editor (GET /api/draft-store/:draftId).
 * Compares editable draft preview vs live published store without mutating either.
 */

import { readCanonicalHeroFromPreview } from './draftPreviewHeroSync.js';
import { buildSourceFingerprintFromCatalog } from './publishSnapshotFingerprint.js';

function parsePreview(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? raw : {};
}

function parseStylePreferences(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function normUrl(u) {
  if (typeof u !== 'string' || !u.trim()) return '';
  return u.trim().split('?')[0];
}

function catalogItemsFromPreview(preview) {
  if (Array.isArray(preview?.items)) return preview.items;
  if (Array.isArray(preview?.products)) return preview.products;
  return [];
}

/**
 * @param {import('@prisma/client').PrismaClient} prismaClient
 * @param {{ id: string; preview?: unknown; committedStoreId?: string | null }} draftRow
 */
export async function buildDraftPublishState(prismaClient, draftRow) {
  const preview = parsePreview(draftRow.preview);
  const committedStoreId =
    typeof draftRow.committedStoreId === 'string' && draftRow.committedStoreId.trim()
      ? draftRow.committedStoreId.trim()
      : null;

  const base = {
    isFirstPublish: true,
    isLive: false,
    liveUrl: null,
    slug: null,
    storeId: committedStoreId,
    publishedAt: null,
    publishedSnapshotVersion: null,
    hasUnpublishedChanges: false,
    changeHints: [],
    draftHeroUrl: readCanonicalHeroFromPreview(preview).heroImage,
    liveHeroUrl: null,
  };

  if (!committedStoreId) return base;

  const [business, draftMeta] = await Promise.all([
    prismaClient.business.findUnique({
      where: { id: committedStoreId },
      select: {
        id: true,
        slug: true,
        isActive: true,
        publishedAt: true,
        heroImageUrl: true,
        stylePreferences: true,
      },
    }),
    prismaClient.draftStore.findUnique({
      where: { id: draftRow.id },
      select: { publishSnapshotVersion: true, publishSnapshot: true },
    }),
  ]);

  if (!business) return base;

  const prefs = parseStylePreferences(business.stylePreferences);
  const slug = typeof business.slug === 'string' && business.slug.trim() ? business.slug.trim() : null;
  const isLive = Boolean(business.publishedAt && business.isActive && slug);
  const liveHeroImage =
    (typeof business.heroImageUrl === 'string' && business.heroImageUrl.trim()) ||
    (typeof prefs.heroImage === 'string' && prefs.heroImage.trim()) ||
    null;
  const liveHeroVideo =
    typeof prefs.heroVideo === 'string' && prefs.heroVideo.trim() ? prefs.heroVideo.trim() : null;
  const liveHeroUrl = liveHeroVideo || liveHeroImage;

  const { heroImage, heroVideo, isVideo } = readCanonicalHeroFromPreview(preview);
  const draftHeroUrl = isVideo && heroVideo ? heroVideo : heroImage;
  const changeHints = [];

  const hasUnpublishedHero =
    isLive && normUrl(draftHeroUrl) !== normUrl(liveHeroUrl) && Boolean(draftHeroUrl || liveHeroUrl);
  if (hasUnpublishedHero) {
    changeHints.push(isVideo || liveHeroVideo ? 'Hero media' : 'Hero image');
  }

  let hasUnpublishedCatalog = false;
  const draftItems = catalogItemsFromPreview(preview);
  const draftFp = buildSourceFingerprintFromCatalog(draftItems);
  let snapshotVersion =
    draftMeta?.publishSnapshotVersion != null ? Number(draftMeta.publishSnapshotVersion) : null;
  if (Number.isNaN(snapshotVersion)) snapshotVersion = null;

  if (draftMeta?.publishSnapshot) {
    let snap = draftMeta.publishSnapshot;
    if (typeof snap === 'string') {
      try {
        snap = JSON.parse(snap);
      } catch {
        snap = null;
      }
    }
    const snapFp = snap?.sourceFingerprint;
    if (isLive && snapFp && draftFp && snapFp !== draftFp) {
      hasUnpublishedCatalog = true;
      changeHints.push('Catalog');
    }
    if (snapshotVersion == null && snap?.version != null) {
      snapshotVersion = Number(snap.version) || null;
    }
  }

  const publishedAt =
    business.publishedAt?.toISOString?.() ??
    (typeof prefs.publishedAt === 'string' ? prefs.publishedAt : null) ??
    null;

  const publishedSnapshotVersion =
    snapshotVersion ??
    (typeof prefs.publishedSnapshotVersion === 'number' ? prefs.publishedSnapshotVersion : null);

  return {
    isFirstPublish: !isLive,
    isLive,
    liveUrl: isLive && slug ? `/s/${encodeURIComponent(slug)}` : null,
    slug,
    storeId: committedStoreId,
    publishedAt,
    publishedSnapshotVersion,
    hasUnpublishedChanges: hasUnpublishedHero || hasUnpublishedCatalog,
    changeHints,
    draftHeroUrl,
    liveHeroUrl,
  };
}
