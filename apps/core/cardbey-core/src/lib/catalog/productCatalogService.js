// DANH: skill-round2-catalog

/**
 * Product catalog operations — uses actual Product schema (businessId, deletedAt, isPublished).
 */

/**
 * @param {string} name
 */
export function normalizeProductName(name) {
  return String(name ?? '').trim().toLowerCase();
}

const ACTIVE_WHERE = { deletedAt: null };

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 */
export async function getCatalogSummary(prisma, storeId) {
  const [total, products] = await Promise.all([
    prisma.product.count({ where: { businessId: storeId, ...ACTIVE_WHERE } }),
    prisma.product.findMany({
      where: { businessId: storeId, ...ACTIVE_WHERE },
      select: { category: true },
    }),
  ]);

  const categoryCounts = new Map();
  for (const p of products) {
    const cat = (p.category && String(p.category).trim()) || 'Uncategorized';
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  }

  const byCategory = [...categoryCounts.entries()].map(([category, count]) => ({
    category,
    _count: { id: count },
  }));

  return { total, byCategory };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 * @param {object} [filters]
 */
export async function listProducts(prisma, storeId, filters = {}) {
  const { category, limit = 50, publishedOnly = false } = filters;

  return prisma.product.findMany({
    where: {
      businessId: storeId,
      ...ACTIVE_WHERE,
      ...(publishedOnly ? { isPublished: true } : {}),
      ...(category ? { category } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 * @param {object} params
 */
export async function addProduct(prisma, storeId, params) {
  const name = String(params.name ?? '').trim();
  if (!name) {
    throw new Error('Product name is required');
  }

  return prisma.product.create({
    data: {
      businessId: storeId,
      name,
      normalizedName: normalizeProductName(name),
      description: params.description ?? null,
      price: params.price != null ? Number(params.price) : null,
      currency: params.currency ?? 'AUD',
      category: params.category ?? 'General',
      isPublished: params.isPublished ?? false,
    },
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} productId
 * @param {object} updates
 */
export async function updateProduct(prisma, productId, updates) {
  const data = { ...updates };
  if (typeof data.name === 'string' && data.name.trim()) {
    data.normalizedName = normalizeProductName(data.name);
  }
  delete data.productId;

  return prisma.product.update({
    where: { id: productId },
    data,
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} productId
 */
export async function removeProduct(prisma, productId) {
  return prisma.product.update({
    where: { id: productId },
    data: { deletedAt: new Date(), isPublished: false },
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 * @param {Array<{ productId: string, price: number }>} updates
 */
export async function updatePricing(prisma, storeId, updates = []) {
  const results = await Promise.all(
    updates.map(({ productId, price }) =>
      prisma.product.update({
        where: { id: productId, businessId: storeId },
        data: { price: Number(price) },
      }),
    ),
  );
  return results;
}
