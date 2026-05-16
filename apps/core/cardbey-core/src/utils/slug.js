/**
 * Slug generation utilities
 * Used for creating URL-safe slugs for stores and other entities
 */

/**
 * Convert a string to a URL-safe slug
 * @param {string} input - Input string
 * @returns {string} - URL-safe slug
 */
export function slugify(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Generate a unique store slug
 * @param {Object} prisma - PrismaClient instance
 * @param {string} base - Base string (usually store name)
 * @returns {Promise<string>} - Unique slug
 */
export async function generateUniqueStoreSlug(prisma, base) {
  let slug = slugify(base) || 'store';
  let suffix = 1;
  const maxAttempts = 100;

  while (suffix <= maxAttempts) {
    const exists = await prisma.business.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!exists) {
      return slug;
    }
    suffix += 1;
    slug = `${slugify(base)}-${suffix}`;
  }

  // Fallback to timestamp-based slug if too many collisions
  return `${slugify(base)}-${Date.now()}`;
}

/**
 * Generate a unique store slug using a transaction client (commitDraft / atomic flows).
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} base
 * @param {string | null} [excludeBusinessId] - if the slug is taken only by this business, keep it
 */
export async function generateUniqueStoreSlugForTx(tx, base, excludeBusinessId = null) {
  let slug = slugify(base) || 'store';
  let suffix = 1;
  const maxAttempts = 100;

  while (suffix <= maxAttempts) {
    const exists = await tx.business.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!exists || (excludeBusinessId && exists.id === excludeBusinessId)) {
      return slug;
    }
    suffix += 1;
    slug = `${slugify(base) || 'store'}-${suffix}`;
  }

  return `${slugify(base) || 'store'}-${Date.now()}`;
}



