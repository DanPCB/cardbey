/**
 * Load published store context for poster generation and marketing tools.
 */

import { getPrismaClient } from '../lib/prisma.js';

/**
 * @param {unknown} images
 * @returns {string | null}
 */
function firstProductImage(images, imageUrl) {
  if (imageUrl && String(imageUrl).trim()) return String(imageUrl).trim();
  if (!images) return null;
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);
      if (Array.isArray(parsed) && parsed[0]) return String(parsed[0]).trim() || null;
    } catch {
      return images.trim() || null;
    }
  }
  if (Array.isArray(images) && images[0]) return String(images[0]).trim() || null;
  return null;
}

/**
 * @param {string | null | undefined} storeId
 * @returns {Promise<{
 *   id: string;
 *   name: string;
 *   type: string;
 *   location: string;
 *   heroImage: string | null;
 *   avatarImage: string | null;
 *   phone: string | null;
 *   products: Array<{ id: string; name: string; description?: string | null; price?: number | null; image: string | null }>;
 * } | null>}
 */
export async function getStoreContext(storeId) {
  const id = typeof storeId === 'string' ? storeId.trim() : '';
  if (!id) return null;

  const prisma = getPrismaClient();
  const business = await prisma.business.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      suburb: true,
      address: true,
      region: true,
      postcode: true,
      country: true,
      phone: true,
      heroImageUrl: true,
      avatarImageUrl: true,
    },
  });

  if (!business) return null;

  const products = await prisma.product.findMany({
    where: { businessId: id, deletedAt: null },
    orderBy: [{ isPublished: 'desc' }, { createdAt: 'desc' }],
    take: 20,
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      imageUrl: true,
      images: true,
    },
  });

  const location =
    [business.suburb, business.address].filter(Boolean).join(', ').trim() ||
    business.region?.trim() ||
    'your area';

  return {
    id: business.id,
    name: business.name,
    type: business.type,
    location,
    heroImage: business.heroImageUrl ?? null,
    avatarImage: business.avatarImageUrl ?? null,
    phone: business.phone ?? null,
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      image: firstProductImage(p.images, p.imageUrl),
    })),
  };
}
