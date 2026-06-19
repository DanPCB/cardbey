/**
 * Product Creator — create catalog product from scanned entity data (governed confirm path).
 */

import { getPrismaClient } from '../../lib/prisma.js';
import { addProduct, normalizeProductName } from '../../lib/catalog/productCatalogService.js';

/**
 * @param {string} storeId
 * @param {object} extractedData
 * @param {string|null} userId
 */
export async function createFromScan(storeId, extractedData, userId) {
  const sid = String(storeId ?? '').trim();
  const uid = String(userId ?? '').trim();

  if (!sid) {
    return { ok: false, error: 'STORE_REQUIRED', message: 'Store is required to create a product.' };
  }
  if (!uid) {
    return { ok: false, error: 'AUTH_REQUIRED', message: 'Sign in to create products from a scan.' };
  }

  const name = String(extractedData?.name ?? '').trim();
  if (!name) {
    return {
      ok: false,
      error: 'NAME_NOT_FOUND',
      message: 'Could not extract a product name from the image. Please enter it manually.',
    };
  }

  const prisma = getPrismaClient();

  const business = await prisma.business.findFirst({
    where: { id: sid, userId: uid },
    select: { id: true, name: true },
  });

  if (!business) {
    return {
      ok: false,
      error: 'STORE_NOT_FOUND',
      message: 'Store not found or you do not have access.',
    };
  }

  const normalized = normalizeProductName(name);
  const existing = await prisma.product.findFirst({
    where: { businessId: sid, normalizedName: normalized, deletedAt: null },
    select: { id: true, name: true },
  });

  if (existing) {
    return {
      ok: false,
      error: 'DUPLICATE_PRODUCT',
      message: `Product "${existing.name}" already exists in this store.`,
      existingProduct: existing,
    };
  }

  const contactBits = [
    extractedData?.phone ? `Phone: ${extractedData.phone}` : null,
    extractedData?.email ? `Email: ${extractedData.email}` : null,
    extractedData?.website ? `Web: ${extractedData.website}` : null,
    extractedData?.address ? `Address: ${extractedData.address}` : null,
  ].filter(Boolean);

  const baseDescription = String(extractedData?.description ?? '').trim();
  const description =
    [baseDescription, contactBits.length ? contactBits.join(' · ') : null, 'Created from card scan.']
      .filter(Boolean)
      .join('\n')
      .slice(0, 2000) || 'Created from card scan.';

  try {
    const product = await addProduct(prisma, sid, {
      name,
      description,
      category: extractedData?.category || 'Scanned',
      isPublished: false,
    });

    return {
      ok: true,
      product,
      message: `Product "${name}" created from scan.`,
    };
  } catch (error) {
    console.error('[ProductCreator] createFromScan failed:', error?.message ?? error);
    return {
      ok: false,
      error: 'CREATE_FAILED',
      message: 'Failed to create product. Please try again.',
    };
  }
}

export default { createFromScan };
