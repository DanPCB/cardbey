/**
 * Paginated product listing for store catalog APIs.
 * categoryId matches storefront preview: slugify(category name) or "other" / "uncategorized".
 */

import { CATALOG_ITEM_LIMIT, API_PRODUCTS_DEFAULT_LIMIT, API_PRODUCTS_MAX_LIMIT } from '../config/catalogLimits.js';
import { getTranslatedField } from '../services/i18n/translationUtils.js';
import { slugify } from '../utils/slug.js';

export const OTHER_CATEGORY_IDS = new Set(['other', 'uncategorized']);

/**
 * @param {string|null|undefined} categoryName
 * @returns {string}
 */
export function categoryNameToId(categoryName) {
  const name = categoryName != null ? String(categoryName).trim() : '';
  if (!name) return 'other';
  return slugify(name) || 'other';
}

/**
 * @param {number|string|undefined} rawLimit
 * @param {number|string|undefined} rawOffset
 * @returns {{ limit: number, offset: number }}
 */
export function parseProductPagination(rawLimit, rawOffset) {
  const parsedLimit = parseInt(String(rawLimit ?? ''), 10);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, API_PRODUCTS_MAX_LIMIT)
    : API_PRODUCTS_DEFAULT_LIMIT;
  const parsedOffset = parseInt(String(rawOffset ?? ''), 10);
  const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  return { limit, offset };
}

/**
 * Resolve Prisma category filter from categoryId query param.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} businessId
 * @param {string|null|undefined} categoryId
 * @param {object} baseWhere - must include businessId
 * @returns {Promise<object|null>} extra where fragment, or null if categoryId invalid
 */
export async function buildCategoryWhere(prisma, businessId, categoryId, baseWhere) {
  const id = categoryId != null ? String(categoryId).trim().toLowerCase() : '';
  if (!id) return {};

  const rows = await prisma.product.findMany({
    where: { ...baseWhere },
    select: { category: true },
    distinct: ['category'],
  });

  if (OTHER_CATEGORY_IDS.has(id)) {
    const otherNames = rows
      .map((r) => r.category)
      .filter((c) => c != null && String(c).trim())
      .filter((c) => categoryNameToId(c) === 'other');
    const or = [{ category: null }, { category: '' }, ...otherNames.map((name) => ({ category: name }))];
    return { OR: or };
  }

  const matchingNames = rows
    .map((r) => r.category)
    .filter((c) => c != null && String(c).trim())
    .filter((c) => categoryNameToId(c) === id);

  if (matchingNames.length === 0) {
    return { id: { in: [] } };
  }
  return { category: { in: matchingNames } };
}

/**
 * @param {object} product - Prisma product row
 * @param {{ lang?: string }} [options]
 */
export function mapProductToListDto(product, options = {}) {
  const { lang } = options;
  const category =
    getTranslatedField(product, 'category', lang) ?? product.category ?? null;
  return {
    id: product.id,
    name: getTranslatedField(product, 'name', lang) || product.name,
    description: getTranslatedField(product, 'description', lang) ?? product.description ?? null,
    category,
    categoryId: categoryNameToId(category),
    price: product.price ?? null,
    currency: product.currency ?? null,
    imageUrl: product.imageUrl ?? null,
    isPublished: product.isPublished === true,
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} params
 * @param {string} params.businessId
 * @param {boolean} [params.publishedOnly]
 * @param {string|null} [params.categoryId]
 * @param {number} [params.limit]
 * @param {number} [params.offset]
 * @param {string} [params.lang]
 */
export async function listStoreProducts(prisma, params) {
  const {
    businessId,
    publishedOnly = false,
    categoryId = null,
    limit = API_PRODUCTS_DEFAULT_LIMIT,
    offset = 0,
    lang,
  } = params;

  const safeLimit = Math.min(Math.max(1, limit), API_PRODUCTS_MAX_LIMIT);
  const safeOffset = Math.max(0, offset);

  const baseWhere = {
    businessId,
    deletedAt: null,
    ...(publishedOnly ? { isPublished: true } : {}),
  };

  const categoryWhere = await buildCategoryWhere(prisma, businessId, categoryId, baseWhere);
  const where = { ...baseWhere, ...categoryWhere };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      skip: safeOffset,
      take: safeLimit,
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        price: true,
        currency: true,
        imageUrl: true,
        isPublished: true,
        translations: true,
      },
    }),
    prisma.product.count({ where }),
  ]);

  const products = rows.map((p) => mapProductToListDto(p, { lang }));
  const hasMore = safeOffset + products.length < total;

  return {
    products,
    total,
    limit: safeLimit,
    offset: safeOffset,
    hasMore,
    maxLimit: CATALOG_ITEM_LIMIT,
  };
}
