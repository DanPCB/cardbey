/**
 * Canonical publish snapshot — single source of truth for preview + publish.
 * Feature flag: PUBLISH_SNAPSHOT_V1=true
 */

import crypto from 'crypto';
import {
  buildHeroFingerprintFromPreview,
  buildHeroFingerprintFromSnapshotHero,
  buildSourceFingerprintFromCatalog,
} from './publishSnapshotFingerprint.js';
import { enforcePublishHeroCanonical } from './heroPublishInvariant.js';
import { normalizePreviewCategories } from './draftStoreService.js';
import { publicWebBase } from '../../utils/publicWebBase.js';
import {
  resolveCanonicalHeroMediaFromPreview,
  writeCanonicalHeroMediaToPreview,
} from './draftPreviewHeroSync.js';

export function isPublishSnapshotV1Enabled() {
  return process.env.PUBLISH_SNAPSHOT_V1 === 'true' || process.env.PUBLISH_SNAPSHOT_V1 === '1';
}

export class PublishSnapshotError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'PublishSnapshotError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function parsePreviewBlob(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
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

function parseInputBlob(raw) {
  return parsePreviewBlob(raw);
}

function catalogProductsFromPreview(preview) {
  if (Array.isArray(preview?.items) && preview.items.length > 0) return preview.items;
  if (Array.isArray(preview?.catalog?.products) && preview.catalog.products.length > 0) {
    return preview.catalog.products;
  }
  return [];
}

function newPublishSourceId(draftId) {
  return `ps_${draftId}_${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * @param {object} draft - DraftStore row
 * @param {object} preview - parsed preview
 * @param {number} version
 * @param {string} [publishSourceId]
 */
export function buildPublishSnapshotFromPreview(draft, preview, version = 1, publishSourceId) {
  const normalized = { ...preview };
  normalizePreviewCategories(normalized);
  let heroFingerprint = '';
  try {
    enforcePublishHeroCanonical(normalized, { source: 'buildPublishSnapshotFromPreview' });
    heroFingerprint = buildHeroFingerprintFromPreview(normalized);
  } catch (e) {
    console.warn('[publish-snapshot] hero canonicalize failed (non-fatal):', e?.message || e);
    heroFingerprint = buildHeroFingerprintFromPreview(normalized);
  }
  const products = catalogProductsFromPreview(normalized);
  const categories = Array.isArray(normalized.categories) ? normalized.categories : [];
  const input = parseInputBlob(draft.input);
  const meta = normalized.meta && typeof normalized.meta === 'object' ? { ...normalized.meta } : {};
  const generationRunId =
    draft.generationRunId ||
    input.generationRunId ||
    meta.generationRunId ||
    null;
  const missionId = meta.missionId || input.missionId || null;
  const ownerId = draft.ownerUserId || meta.ownerUserId || null;
  const storeId =
    draft.committedStoreId ||
    meta.storeId ||
    input.storeId ||
    null;
  const name =
    meta.storeName ||
    normalized.storeName ||
    input.businessName ||
    'Untitled Store';
  const now = new Date().toISOString();
  const fingerprint = buildSourceFingerprintFromCatalog(products);

  return {
    publishSourceId: publishSourceId || newPublishSourceId(draft.id),
    draftId: draft.id,
    generationRunId: generationRunId || undefined,
    missionId: missionId || undefined,
    ownerId: ownerId || undefined,
    storeId: storeId || undefined,
    slug: meta.slug || normalized.slug || undefined,
    name: String(name).trim() || 'Untitled Store',
    catalog: {
      products,
      categories,
    },
    website: normalized.website || normalized.miniWebsite || undefined,
    theme: normalized.theme || normalized.stylePreferences || undefined,
    hero: normalized.hero || undefined,
    heroFingerprint: heroFingerprint || buildHeroFingerprintFromSnapshotHero(normalized.hero),
    media: normalized.media || undefined,
    meta,
    sourceFingerprint: fingerprint,
    catalogVersion: Number(meta.catalogVersion) || 1,
    previewVersion: Number(meta.previewVersion) || 1,
    version,
    createdAt: now,
    updatedAt: now,
  };
}

/** Convert snapshot back to draft preview shape for publishDraft. */
export function snapshotToPreviewShape(snapshot) {
  const products = snapshot?.catalog?.products ?? [];
  const categories = snapshot?.catalog?.categories ?? [];
  const preview = {
    items: products,
    catalog: { products, categories },
    categories,
    storeName: snapshot.name,
    meta: {
      ...(snapshot.meta || {}),
      storeName: snapshot.name,
      generationRunId: snapshot.generationRunId,
      missionId: snapshot.missionId,
      publishSourceId: snapshot.publishSourceId,
      catalogVersion: snapshot.catalogVersion,
      previewVersion: snapshot.previewVersion,
    },
  };
  if (snapshot.hero && typeof snapshot.hero === 'object') {
    const hero = snapshot.hero;
    const seed = { hero: { ...hero } };
    const videoFromSnapshot =
      (typeof hero.videoUrl === 'string' && hero.videoUrl.trim()) ||
      (hero.type === 'video' && typeof hero.url === 'string' && hero.url.trim()) ||
      null;
    if (videoFromSnapshot) {
      seed.heroVideoUrl = videoFromSnapshot;
      seed.heroVideo = videoFromSnapshot;
      seed.heroMediaType = 'video';
    } else if (hero.type === 'image' || (typeof hero.imageUrl === 'string' && hero.imageUrl.trim())) {
      seed.heroMediaType = 'image';
      if (typeof hero.imageUrl === 'string' && hero.imageUrl.trim()) {
        seed.heroImageUrl = hero.imageUrl.trim();
      }
    } else if (typeof hero.url === 'string' && hero.url.trim()) {
      seed.heroImageUrl = hero.url.trim();
      seed.heroMediaType = 'image';
    }
    const canonical = resolveCanonicalHeroMediaFromPreview(seed);
    writeCanonicalHeroMediaToPreview(preview, canonical);
    enforcePublishHeroCanonical(preview, { source: 'snapshotToPreviewShape', silent: true });
    if (hero.source && preview.hero && typeof preview.hero === 'object') {
      preview.hero.source = hero.source;
    }
  }
  if (snapshot.website) preview.website = snapshot.website;
  if (snapshot.theme) preview.theme = snapshot.theme;
  if (snapshot.media) preview.media = snapshot.media;
  return preview;
}

function catalogFirstNames(products, limit = 5) {
  if (!Array.isArray(products)) return [];
  return products
    .map((p) => (typeof p?.name === 'string' ? p.name.trim() : ''))
    .filter(Boolean)
    .slice(0, limit);
}

function logTag(tag, fields) {
  const products = fields.catalog?.products ?? fields.products;
  const productCount =
    fields.productCount ??
    fields.catalogCount ??
    (Array.isArray(products) ? products.length : undefined);
  const firstNames = fields.firstNames ?? catalogFirstNames(products);
  const payload = {
    draftId: fields.draftId,
    generationRunId: fields.generationRunId,
    missionId: fields.missionId,
    storeId: fields.storeId,
    slug: fields.slug,
    snapshotVersion: fields.snapshotVersion ?? fields.version,
    fingerprint: fields.fingerprint ?? fields.sourceFingerprint,
    hash: fields.hash ?? fields.fingerprint ?? fields.sourceFingerprint,
    productCount,
    catalogCount: productCount,
    firstNames,
    source: fields.source,
    reconciled: fields.reconciled,
    reason: fields.reason,
  };
  console.log(`[${tag}]`, payload);
}

/**
 * Re-read draft.preview and rebuild publishSnapshot (menu replace / patchDraftPreview sync).
 * @returns {Promise<object|null>}
 */
export async function refreshPublishSnapshotFromCurrentPreview(prisma, draftId) {
  if (!isPublishSnapshotV1Enabled()) return null;
  const draft = await loadDraftRow(prisma, draftId);
  if (!draft) return null;
  const preview = parsePreviewBlob(draft.preview);
  const snapshot = await syncPublishSnapshotFromPreview(prisma, draftId, preview, draft);
  const products = catalogProductsFromPreview(preview);
  logTag('PUBLISH_SNAPSHOT_SAVE', {
    draftId,
    generationRunId: snapshot?.generationRunId,
    snapshotVersion: snapshot?.version,
    fingerprint: snapshot?.sourceFingerprint,
    productCount: products.length,
    firstNames: catalogFirstNames(products),
    source: 'refresh_from_preview',
  });
  return snapshot;
}

/**
 * @param {import('../../lib/prisma.js').PrismaClient} prisma
 */
export async function loadDraftRow(prisma, draftId) {
  return prisma.draftStore.findUnique({ where: { id: draftId } });
}

/**
 * Ensure snapshot exists; migrate from preview when missing.
 * @returns {Promise<{ snapshot: object, version: number, migrated: boolean }>}
 */
export async function ensurePublishSnapshot(prisma, draftId) {
  const draft = await loadDraftRow(prisma, draftId);
  if (!draft) {
    throw new PublishSnapshotError('draft_not_found', 'Draft store not found', 404);
  }

  let stored = draft.publishSnapshot;
  if (typeof stored === 'string') {
    try {
      stored = JSON.parse(stored);
    } catch {
      stored = null;
    }
  }
  const version = Number(draft.publishSnapshotVersion) || 0;

  if (stored && typeof stored === 'object' && stored.draftId === draftId) {
    const preview = parsePreviewBlob(draft.preview);
    const previewProducts = catalogProductsFromPreview(preview);
    const previewFp = buildSourceFingerprintFromCatalog(previewProducts);
    const storedFp = stored.sourceFingerprint || '';
    const previewHeroFp = buildHeroFingerprintFromPreview(preview);
    const storedHeroFp =
      stored.heroFingerprint || buildHeroFingerprintFromSnapshotHero(stored.hero);
    const heroDrift = previewHeroFp && storedHeroFp && previewHeroFp !== storedHeroFp;
    if ((previewFp && storedFp && previewFp !== storedFp) || heroDrift) {
      const nextVersion = (Number(draft.publishSnapshotVersion) || version || 0) + 1;
      const snapshot = buildPublishSnapshotFromPreview(
        draft,
        preview,
        nextVersion,
        stored.publishSourceId,
      );
      await prisma.draftStore.update({
        where: { id: draftId },
        data: {
          publishSnapshot: snapshot,
          publishSnapshotVersion: nextVersion,
        },
      });
      logTag('PUBLISH_SNAPSHOT_SAVE', {
        draftId,
        generationRunId: snapshot.generationRunId,
        snapshotVersion: nextVersion,
        fingerprint: snapshot.sourceFingerprint,
        productCount: previewProducts.length,
        firstNames: catalogFirstNames(previewProducts),
        source: 'reconcile_preview_drift',
        reconciled: true,
        reason: heroDrift ? 'preview_hero_drift' : 'preview_fingerprint_drift',
      });
      return { snapshot, version: nextVersion, migrated: false, draft, reconciled: true };
    }
    logTag('PUBLISH_SNAPSHOT_LOAD', {
      draftId,
      generationRunId: stored.generationRunId,
      snapshotVersion: stored.version ?? version,
      fingerprint: stored.sourceFingerprint,
      productCount: stored.catalog?.products?.length,
      firstNames: catalogFirstNames(stored.catalog?.products),
      migrated: false,
    });
    return { snapshot: stored, version: stored.version ?? version, migrated: false, draft };
  }

  const preview = parsePreviewBlob(draft.preview);
  const nextVersion = Math.max(version, 1);
  const snapshot = buildPublishSnapshotFromPreview(draft, preview, nextVersion);
  await prisma.draftStore.update({
    where: { id: draftId },
    data: {
      publishSnapshot: snapshot,
      publishSnapshotVersion: nextVersion,
    },
  });
  logTag('PUBLISH_SNAPSHOT_SAVE', {
    draftId,
    generationRunId: snapshot.generationRunId,
    snapshotVersion: nextVersion,
    fingerprint: snapshot.sourceFingerprint,
    productCount: snapshot.catalog?.products?.length,
    firstNames: catalogFirstNames(snapshot.catalog?.products),
    source: 'migrate_from_preview',
    migrated: true,
  });
  return { snapshot, version: nextVersion, migrated: true, draft };
}

export async function getPublishSnapshot(prisma, draftId) {
  const { snapshot, version } = await ensurePublishSnapshot(prisma, draftId);
  return { snapshot, version };
}

/**
 * @param {import('../../lib/prisma.js').PrismaClient} prisma
 * @param {string} draftId
 * @param {object} patch - partial snapshot fields (catalog, hero, theme, name, meta)
 * @param {{ expectedVersion?: number }} [opts]
 */
export async function patchPublishSnapshot(prisma, draftId, patch, opts = {}) {
  const { snapshot, version, draft } = await ensurePublishSnapshot(prisma, draftId);
  const expectedVersion = opts.expectedVersion;
  if (expectedVersion != null && Number(expectedVersion) !== Number(version)) {
    throw new PublishSnapshotError(
      'snapshot_version_mismatch',
      `Snapshot version mismatch. Expected ${expectedVersion}, current ${version}. Sync preview before saving.`,
      409,
    );
  }

  const nextVersion = version + 1;
  const merged = { ...snapshot, version: nextVersion, updatedAt: new Date().toISOString() };

  if (patch.catalog) {
    merged.catalog = {
      products: patch.catalog.products ?? merged.catalog?.products ?? [],
      categories: patch.catalog.categories ?? merged.catalog?.categories ?? [],
    };
    merged.catalogVersion = (Number(merged.catalogVersion) || 0) + 1;
  }
  if (patch.hero !== undefined) merged.hero = patch.hero;
  if (patch.theme !== undefined) merged.theme = patch.theme;
  if (patch.website !== undefined) merged.website = patch.website;
  if (patch.media !== undefined) merged.media = patch.media;
  if (typeof patch.name === 'string' && patch.name.trim()) merged.name = patch.name.trim();
  if (patch.meta && typeof patch.meta === 'object') {
    merged.meta = { ...(merged.meta || {}), ...patch.meta };
  }

  merged.sourceFingerprint = buildSourceFingerprintFromCatalog(merged.catalog?.products ?? []);
  merged.previewVersion = (Number(merged.previewVersion) || 0) + 1;

  // Keep DraftStore.preview aligned (publish legacy path + other readers)
  const previewShape = snapshotToPreviewShape(merged);
  normalizePreviewCategories(previewShape);

  await prisma.draftStore.update({
    where: { id: draftId },
    data: {
      publishSnapshot: merged,
      publishSnapshotVersion: nextVersion,
      preview: previewShape,
      updatedAt: new Date(),
    },
  });

  logTag('PUBLISH_SNAPSHOT_SAVE', {
    draftId,
    generationRunId: merged.generationRunId,
    snapshotVersion: nextVersion,
    fingerprint: merged.sourceFingerprint,
    productCount: merged.catalog?.products?.length,
    firstNames: catalogFirstNames(merged.catalog?.products),
    source: 'patch_publish_snapshot',
  });

  return { snapshot: merged, version: nextVersion, draft };
}

/**
 * After patchDraftPreview, sync snapshot from merged preview (when flag on).
 */
export async function syncPublishSnapshotFromPreview(prisma, draftId, mergedPreview, draftRow) {
  if (!isPublishSnapshotV1Enabled()) return null;
  const draft = draftRow || (await loadDraftRow(prisma, draftId));
  if (!draft) return null;
  const version = (Number(draft.publishSnapshotVersion) || 0) + 1;
  let existingSourceId = null;
  const prev = draft.publishSnapshot;
  if (prev && typeof prev === 'object' && prev.publishSourceId) existingSourceId = prev.publishSourceId;
  const snapshot = buildPublishSnapshotFromPreview(draft, mergedPreview, version, existingSourceId);
  await prisma.draftStore.update({
    where: { id: draftId },
    data: {
      publishSnapshot: snapshot,
      publishSnapshotVersion: version,
    },
  });
  logTag('PUBLISH_SNAPSHOT_SAVE', {
    draftId,
    generationRunId: snapshot.generationRunId,
    snapshotVersion: version,
    fingerprint: snapshot.sourceFingerprint,
    productCount: snapshot.catalog?.products?.length,
    firstNames: catalogFirstNames(snapshot.catalog?.products),
    source: 'sync_from_preview',
  });
  return snapshot;
}

/**
 * Verify client-supplied identity before publish mutation.
 */
export function verifyPublishIdentity(snapshot, expected) {
  const errors = [];
  if (expected.expectedDraftId && expected.expectedDraftId !== snapshot.draftId) {
    errors.push('draftId');
  }
  if (
    expected.expectedGenerationRunId &&
    snapshot.generationRunId &&
    expected.expectedGenerationRunId !== snapshot.generationRunId
  ) {
    errors.push('generationRunId');
  }
  if (
    expected.expectedSnapshotVersion != null &&
    Number(expected.expectedSnapshotVersion) !== Number(snapshot.version)
  ) {
    errors.push('snapshotVersion');
  }
  if (
    expected.expectedSourceFingerprint &&
    expected.expectedSourceFingerprint !== snapshot.sourceFingerprint
  ) {
    errors.push('sourceFingerprint');
  }
  if (errors.length) {
    logTag('PUBLISH_MISMATCH_BLOCKED', {
      draftId: snapshot.draftId,
      generationRunId: snapshot.generationRunId,
      snapshotVersion: snapshot.version,
      fingerprint: snapshot.sourceFingerprint,
      blockedFields: errors.join(','),
    });
    throw new PublishSnapshotError(
      'publish_identity_mismatch',
      `Publish blocked: ${errors.join(', ')} does not match the stored publish snapshot. Sync preview before publishing.`,
      409,
    );
  }
  logTag('PUBLISH_IDENTITY_CHECK', {
    draftId: snapshot.draftId,
    generationRunId: snapshot.generationRunId,
    snapshotVersion: snapshot.version,
    fingerprint: snapshot.sourceFingerprint,
    productCount: snapshot.catalog?.products?.length,
  });
  logTag('PUBLISH_FINGERPRINT_CHECK', {
    draftId: snapshot.draftId,
    fingerprint: snapshot.sourceFingerprint,
    productCount: snapshot.catalog?.products?.length,
  });
}

/**
 * After publish: confirm slug resolves and store is active.
 * @returns {Promise<{ liveUrl: string, slug: string, storeId: string }>}
 */
export async function verifyPublishedStoreRoute(prisma, { slug, storeId, expectedFingerprint }) {
  const normalizedSlug = String(slug ?? '').toLowerCase().trim();
  if (!normalizedSlug) {
    throw new PublishSnapshotError(
      'publish_route_verify_failed',
      'Publish succeeded but no public slug was assigned.',
      500,
    );
  }

  const store = await prisma.business.findUnique({
    where: { slug: normalizedSlug },
    select: { id: true, slug: true, isActive: true, publishedAt: true },
  });

  if (!store || store.id !== storeId) {
    logTag('PUBLISH_ROUTE_VERIFY', {
      slug: normalizedSlug,
      storeId,
      fingerprint: expectedFingerprint,
      ok: false,
    });
    throw new PublishSnapshotError(
      'publish_route_verify_failed',
      'Published store could not be resolved at the public URL. Please try publishing again or contact support.',
      500,
    );
  }

  if (!store.isActive) {
    throw new PublishSnapshotError(
      'publish_route_verify_failed',
      'Store was created but is not publicly active yet. Please try again.',
      500,
    );
  }

  let liveProductCount = 0;
  let liveFirstNames = [];
  let liveHash = expectedFingerprint || '';
  try {
    const liveProducts = await prisma.product.findMany({
      where: { businessId: storeId },
      select: { name: true, price: true, currency: true, category: true, categoryId: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    liveProductCount = liveProducts.length;
    liveFirstNames = catalogFirstNames(liveProducts);
    liveHash = buildSourceFingerprintFromCatalog(liveProducts) || liveHash;
  } catch (liveErr) {
    console.warn('[LIVE_STORE_COMPARE] product_load_failed', liveErr?.message || liveErr);
  }

  console.log('[LIVE_STORE_COMPARE]', {
    slug: store.slug,
    storeId: store.id,
    productCount: liveProductCount,
    firstNames: liveFirstNames,
    hash: liveHash,
    expectedFingerprint,
  });

  const webBase = publicWebBase();
  const liveUrl = `${webBase}/s/${encodeURIComponent(store.slug)}`;

  logTag('PUBLISH_ROUTE_VERIFY', {
    slug: store.slug,
    storeId: store.id,
    fingerprint: expectedFingerprint,
    ok: true,
  });
  logTag('PUBLISH_SUCCESS_VERIFIED', {
    slug: store.slug,
    storeId: store.id,
    fingerprint: expectedFingerprint,
  });

  return { liveUrl, slug: store.slug, storeId: store.id };
}
