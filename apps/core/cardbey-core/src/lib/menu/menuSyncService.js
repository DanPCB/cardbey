// DANH: skill-round2-menu

import { normalizeProductName, addProduct, updateProduct } from '../catalog/productCatalogService.js';

const ACTIVE_WHERE = { deletedAt: null };

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 */
export async function validateMenu(prisma, storeId) {
  const products = await prisma.product.findMany({
    where: { businessId: storeId, ...ACTIVE_WHERE },
  });

  const issues = [];
  for (const p of products) {
    if (!p.name?.trim()) {
      issues.push({ productId: p.id, issue: 'missing_name' });
    }
    if (p.price == null || p.price < 0) {
      issues.push({ productId: p.id, issue: 'invalid_price' });
    }
    if (!p.category?.trim()) {
      issues.push({ productId: p.id, issue: 'missing_category' });
    }
  }

  return {
    total: products.length,
    valid: products.length - issues.length,
    issues,
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 * @param {object} params
 */
export async function syncFromSource(prisma, storeId, params) {
  const { source = 'manual', items = [] } = params;

  if (!items.length) {
    return { ok: false, synced: 0, source, message: 'No items provided to sync' };
  }

  const created = [];
  for (const item of items) {
    const name = String(item.name ?? '').trim();
    if (!name) continue;

    const normalized = normalizeProductName(name);
    const existing = await prisma.product.findFirst({
      where: {
        businessId: storeId,
        normalizedName: normalized,
        ...ACTIVE_WHERE,
      },
    });

    if (existing) {
      const updated = await updateProduct(prisma, existing.id, {
        price: item.price != null ? Number(item.price) : existing.price,
        description: item.description ?? existing.description,
        category: item.category ?? existing.category,
        isPublished: true,
      });
      created.push(updated);
    } else {
      const row = await addProduct(prisma, storeId, {
        name,
        price: item.price,
        description: item.description,
        category: item.category ?? 'General',
        isPublished: true,
      });
      created.push(row);
    }
  }

  return { ok: true, synced: created.length, source, items: created };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 * @param {object} params
 */
export async function getMenuDiff(prisma, storeId, params) {
  const { incoming = [] } = params;

  const existing = await prisma.product.findMany({
    where: { businessId: storeId, ...ACTIVE_WHERE },
    select: { id: true, name: true, price: true, category: true },
  });

  const existingMap = new Map(existing.map((p) => [normalizeProductName(p.name), p]));
  const incomingMap = new Map(
    incoming.map((p) => [normalizeProductName(p.name), p]).filter(([k]) => k),
  );

  const added = incoming.filter((p) => !existingMap.has(normalizeProductName(p.name)));
  const removed = existing.filter((p) => !incomingMap.has(normalizeProductName(p.name)));
  const changed = incoming.filter((p) => {
    const ex = existingMap.get(normalizeProductName(p.name));
    return ex && ex.price !== p.price;
  });

  return { added, removed, changed };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 */
export async function publishMenu(prisma, storeId) {
  const result = await prisma.product.updateMany({
    where: { businessId: storeId, ...ACTIVE_WHERE },
    data: { isPublished: true, updatedAt: new Date() },
  });

  return { published: result.count };
}
