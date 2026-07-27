/**
 * Bulk menu extraction for Step4MenuImport and similar UIs.
 * Parses a menu image into reviewable items (does not persist to Product table).
 */
import { prisma } from '../../lib/prisma.js';
import { getEventEmitter } from './events.js';
import { extractMenu } from './extractMenu.js';
import { validateMenuStore } from './validateMenuStore.js';
import { getCoreBaseUrl, normalizeMediaUrl } from '../../utils/normalizeMediaUrl.js';

/**
 * @param {import('express').Request} req
 * @param {string | null | undefined} mediaId
 * @param {string | null | undefined} imageUrl
 */
async function resolveMenuImageUrl(req, mediaId, imageUrl) {
  let url = typeof imageUrl === 'string' ? imageUrl.trim() : '';
  if (!url && mediaId) {
    const media = await prisma.media.findUnique({
      where: { id: String(mediaId).trim() },
      select: { url: true, missingFile: true },
    });
    if (!media?.url) {
      const err = new Error(`Media not found: ${mediaId}`);
      err.code = 'MEDIA_NOT_FOUND';
      throw err;
    }
    if (media.missingFile) {
      const err = new Error(`Media file is missing on disk: ${mediaId}`);
      err.code = 'MEDIA_FILE_MISSING';
      throw err;
    }
    url = media.url;
  }
  if (!url) {
    const err = new Error('imageUrl or mediaId is required');
    err.code = 'IMAGE_REQUIRED';
    throw err;
  }
  const coreBase = getCoreBaseUrl(req);
  return normalizeMediaUrl(url, coreBase) || url;
}

/**
 * @param {object} params
 * @param {import('express').Request} params.req
 * @param {string} params.tenantId
 * @param {string} params.storeId
 * @param {string} [params.mediaId]
 * @param {string} [params.imageUrl]
 * @param {string} [params.locale]
 * @param {string} [params.targetCategory]
 * @param {{ rows?: number, cols?: number } | null} [params.grid]
 */
export async function extractMenuItemsFromPhoto({
  req,
  tenantId,
  storeId,
  mediaId,
  imageUrl,
  locale = 'en',
  targetCategory,
  grid = null,
}) {
  await validateMenuStore(prisma, storeId, req.userId ?? null);

  const resolvedImageUrl = await resolveMenuImageUrl(req, mediaId, imageUrl);

  const business = await prisma.business.findUnique({
    where: { id: storeId },
    select: { name: true, type: true },
  });

  const events = getEventEmitter();
  const extraction = await extractMenu(
    {
      tenantId,
      storeId: null,
      imageUrl: resolvedImageUrl,
      locale: locale || 'en',
      businessName: business?.name ?? undefined,
      businessType: business?.type ?? undefined,
    },
    {
      services: { db: prisma, events },
    },
  );

  const parsedItems = extraction?.data?.items ?? [];
  let cropUrls = [];

  const gridCols =
    grid && Number(grid.cols) > 0
      ? Number(grid.cols)
      : parseInt(process.env.MENU_GRID_COLS || '4', 10);
  const gridRows =
    grid && Number(grid.rows) > 0
      ? Number(grid.rows)
      : parseInt(process.env.MENU_GRID_ROWS || '3', 10);

  const shouldGridCrop =
    grid != null ||
    process.env.FEATURE_MENU_GRID_CROP_IMAGES === 'true' ||
    process.env.FEATURE_MENU_GRID_CROP_IMAGES === '1';

  if (shouldGridCrop && resolvedImageUrl) {
    try {
      const { gridCropMenuImages } = await import('../../menu/imageExtractors/gridCropExtractor.js');
      const { uploadCropImage } = await import('../../menu/imageExtractors/uploadCrop.js');
      const { randomUUID } = await import('crypto');
      const extractionId = randomUUID().substring(0, 8);
      const cropResult = await gridCropMenuImages({
        imageUrl: resolvedImageUrl,
        cols: gridCols,
        rows: gridRows,
        photoRatio: parseFloat(process.env.MENU_GRID_PHOTO_RATIO || '0.62'),
        padPx: parseInt(process.env.MENU_GRID_PAD_PX || '6', 10),
        removeOverlay: true,
      });
      if (cropResult.ok && cropResult.crops?.length) {
        const uploaded = await Promise.all(
          cropResult.crops.map((crop) =>
            uploadCropImage({
              buffer: crop.buffer,
              filename: `menu-crop-${storeId}-${extractionId}-${crop.index}.jpg`,
              storeId,
              extractionId,
              index: crop.index,
            }).catch(() => null),
          ),
        );
        cropUrls = uploaded.filter(Boolean).map((u) => normalizeMediaUrl(u.url, getCoreBaseUrl(req)) || u.url);
      }
    } catch (cropErr) {
      console.warn('[Menu extract-items] Grid crop failed (non-fatal):', cropErr?.message || cropErr);
    }
  }

  const defaultCategory =
    typeof targetCategory === 'string' && targetCategory.trim() ? targetCategory.trim() : 'Uncategorized';

  const items = parsedItems.map((item, index) => {
    const cellUrl = cropUrls[index] || item.imageUrl || null;
    return {
      name: item.name || `Item ${index + 1}`,
      description: item.description ?? null,
      price: item.price ?? null,
      currency: item.currency || 'AUD',
      category: item.category || defaultCategory,
      tileIndex: index,
      confidence: 0.75,
      finalImageUrl: cellUrl,
      photoUrl: cellUrl,
      imageUrl: cellUrl,
      cellUrl,
      skippedReason: null,
    };
  });

  const regionsDetected = Math.max(items.length, gridCols * gridRows);
  const itemsAccepted = items.filter((it) => it.name && !it.skippedReason).length;

  return {
    ok: true,
    items,
    regionsDetected,
    itemsAccepted,
    itemsSkipped: Math.max(0, regionsDetected - itemsAccepted),
    failedRegions: [],
    count: items.length,
  };
}
