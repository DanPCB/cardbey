/**
 * One-time maintenance: convert locally-absolute media URLs to relative paths
 * (e.g. http://192.168.1.12:3001/uploads/media/x.mp4 -> /uploads/media/x.mp4).
 *
 * Scans:
 *   - Media.url, Media.optimizedUrl
 *   - SignageAsset.url
 *   - Business.heroImageUrl, Business.stylePreferences (hero fields)
 *   - DraftStore.preview (hero media fields)
 *   - PublishedArtifactProjection.heroVideoUrl, projectionJson.hero
 *
 * Usage (from cardbey-core, with DATABASE_URL set):
 *   node scripts/normalize-stored-media-urls-to-relative.mjs
 *
 * Safe to re-run: rows already relative or CloudFront are unchanged.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.join(__dirname, '..'));

await import('../src/env/loadEnv.js');
const { PrismaClient } = await import('@prisma/client');
const { normalizeMediaUrlForStorage, isCloudFrontUrl } = await import('../src/utils/publicUrl.js');
const {
  normalizeHeroFieldsInPreview,
  normalizeProjectionHeroForStorage,
  normalizeStylePreferencesHeroForStorage,
  normalizeMediaUrlField,
} = await import('../src/services/draftStore/normalizeHeroMediaUrlsForStorage.js');

const prisma = new PrismaClient();

function normField(url) {
  if (!url || typeof url !== 'string') return { next: url, changed: false };
  const trimmed = url.trim();
  if (!trimmed) return { next: url, changed: false };
  if (isCloudFrontUrl(trimmed)) return { next: trimmed, changed: false };
  const next = normalizeMediaUrlForStorage(trimmed, null);
  return { next, changed: next !== trimmed };
}

function parseJsonBlob(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function jsonChanged(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

async function main() {
  let mediaUpdated = 0;
  let signageUpdated = 0;
  let businessUpdated = 0;
  let draftUpdated = 0;
  let projectionUpdated = 0;

  const mediaRows = await prisma.media.findMany({
    select: { id: true, url: true, optimizedUrl: true },
  });

  for (const row of mediaRows) {
    const u = normField(row.url);
    const o = row.optimizedUrl ? normField(row.optimizedUrl) : { next: null, changed: false };
    if (!u.changed && !o.changed) continue;
    await prisma.media.update({
      where: { id: row.id },
      data: {
        url: u.next,
        ...(row.optimizedUrl != null ? { optimizedUrl: o.next } : {}),
      },
    });
    mediaUpdated += 1;
    console.log('[normalize-media-urls] Media', row.id, {
      url: u.changed ? { from: row.url, to: u.next } : undefined,
      optimizedUrl: o.changed ? { from: row.optimizedUrl, to: o.next } : undefined,
    });
  }

  const assets = await prisma.signageAsset.findMany({
    select: { id: true, url: true },
  });

  for (const row of assets) {
    const u = normField(row.url);
    if (!u.changed) continue;
    await prisma.signageAsset.update({
      where: { id: row.id },
      data: { url: u.next },
    });
    signageUpdated += 1;
    console.log('[normalize-media-urls] SignageAsset', row.id, { from: row.url, to: u.next });
  }

  const businesses = await prisma.business.findMany({
    select: { id: true, heroImageUrl: true, stylePreferences: true },
  });

  for (const row of businesses) {
    const data = {};
    const hero = normField(row.heroImageUrl);
    if (hero.changed) data.heroImageUrl = hero.next;

    const prefsBefore = parseJsonBlob(row.stylePreferences);
    if (prefsBefore) {
      const prefsAfter = normalizeStylePreferencesHeroForStorage(prefsBefore);
      if (jsonChanged(prefsBefore, prefsAfter)) data.stylePreferences = prefsAfter;
    }

    if (!Object.keys(data).length) continue;
    await prisma.business.update({ where: { id: row.id }, data });
    businessUpdated += 1;
    console.log('[normalize-media-urls] Business', row.id, {
      heroImageUrl: hero.changed ? { from: row.heroImageUrl, to: hero.next } : undefined,
      stylePreferences: data.stylePreferences ? '(updated)' : undefined,
    });
  }

  const drafts = await prisma.draftStore.findMany({
    select: { id: true, preview: true },
  });

  for (const row of drafts) {
    const previewBefore = parseJsonBlob(row.preview);
    if (!previewBefore) continue;
    const previewAfter = structuredClone(previewBefore);
    normalizeHeroFieldsInPreview(previewAfter);
    if (!jsonChanged(previewBefore, previewAfter)) continue;
    await prisma.draftStore.update({
      where: { id: row.id },
      data: { preview: previewAfter },
    });
    draftUpdated += 1;
    console.log('[normalize-media-urls] DraftStore', row.id, '(preview hero media relativized)');
  }

  const projections = await prisma.publishedArtifactProjection.findMany({
    select: { businessId: true, heroVideoUrl: true, projectionJson: true },
  });

  for (const row of projections) {
    const data = {};
    const heroVideo = normField(row.heroVideoUrl);
    if (heroVideo.changed) data.heroVideoUrl = heroVideo.next;

    const projectionBefore = parseJsonBlob(row.projectionJson);
    if (projectionBefore) {
      const projectionAfter = normalizeProjectionHeroForStorage(structuredClone(projectionBefore));
      if (jsonChanged(projectionBefore, projectionAfter)) data.projectionJson = projectionAfter;
      if (!heroVideo.changed && projectionAfter?.hero?.videoUrl) {
        const indexed = normalizeMediaUrlField(projectionAfter.hero.videoUrl);
        if (indexed && indexed !== row.heroVideoUrl) data.heroVideoUrl = indexed;
      }
    }

    if (!Object.keys(data).length) continue;
    await prisma.publishedArtifactProjection.update({
      where: { businessId: row.businessId },
      data,
    });
    projectionUpdated += 1;
    console.log('[normalize-media-urls] PublishedArtifactProjection', row.businessId, {
      heroVideoUrl: data.heroVideoUrl !== undefined ? { from: row.heroVideoUrl, to: data.heroVideoUrl } : undefined,
      projectionJson: data.projectionJson ? '(updated)' : undefined,
    });
  }

  console.log('[normalize-media-urls] Done.', {
    mediaUpdated,
    signageUpdated,
    businessUpdated,
    draftUpdated,
    projectionUpdated,
    mediaScanned: mediaRows.length,
    signageScanned: assets.length,
    businessScanned: businesses.length,
    draftScanned: drafts.length,
    projectionScanned: projections.length,
  });
}

main()
  .catch((e) => {
    console.error('[normalize-media-urls] Failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
