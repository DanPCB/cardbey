/**
 * Platform admin — browse store catalog / shows and remove test content from live.
 */

import { listStoreProducts } from '../listStoreProducts.js';
import { listStoreShows } from '../../services/storeShows/storeShowsService.js';
import { bumpPublicFeedRankForStore } from '../feed/publicFeedRankBump.js';
import { adminDeleteStore } from './accountManagementService.js';

const SERVICE_CATEGORY_RE = /service|treatment|menu|package|consult/i;

export function classifyCatalogItem(product) {
  const category = String(product?.category ?? '').trim();
  if (SERVICE_CATEGORY_RE.test(category)) return 'service';
  return 'product';
}

export async function searchStoresForAdmin(prisma, { q, limit = 12 }) {
  const term = String(q ?? '').trim();
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 30);
  if (term.length < 2) {
    return { stores: [], total: 0 };
  }

  const stores = await prisma.business.findMany({
    where: {
      OR: [
        { name: { contains: term } },
        { slug: { contains: term } },
        { id: { contains: term } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: safeLimit,
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      userId: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { email: true, displayName: true } },
    },
  });

  return {
    stores: stores.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      isActive: s.isActive,
      ownerEmail: s.user?.email ?? null,
      ownerDisplayName: s.user?.displayName ?? null,
      createdAt: s.createdAt?.toISOString?.() ?? null,
      updatedAt: s.updatedAt?.toISOString?.() ?? null,
    })),
    total: stores.length,
  };
}

export async function getStoreContentInventory(prisma, storeId) {
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      userId: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { email: true, displayName: true } },
    },
  });

  if (!store) {
    const err = new Error('Store not found');
    err.statusCode = 404;
    err.code = 'store_not_found';
    throw err;
  }

  const [catalog, showsResult] = await Promise.all([
    listStoreProducts(prisma, {
      businessId: store.id,
      publishedOnly: false,
      limit: 300,
      offset: 0,
    }),
    listStoreShows(prisma, { storeId: store.id, includeArchived: true }),
  ]);

  const products = [];
  const services = [];
  for (const item of catalog.products) {
    if (classifyCatalogItem(item) === 'service') services.push(item);
    else products.push(item);
  }

  const shows = showsResult.works.map((w) => ({
    id: w.id,
    title: w.title ?? w.name ?? 'Untitled',
    status: w.status ?? 'PUBLISHED',
    kind: w.kind ?? null,
    isPublic: String(w.status ?? 'PUBLISHED').toUpperCase() === 'PUBLISHED',
    provenance: w.provenance ?? null,
  }));

  return {
    store: {
      id: store.id,
      name: store.name,
      slug: store.slug,
      isActive: store.isActive,
      ownerEmail: store.user?.email ?? null,
      ownerDisplayName: store.user?.displayName ?? null,
      publicUrl: store.slug ? `/s/${store.slug}` : null,
      createdAt: store.createdAt?.toISOString?.() ?? null,
      updatedAt: store.updatedAt?.toISOString?.() ?? null,
    },
    summary: {
      productCount: products.length,
      serviceCount: services.length,
      showCount: shows.length,
      liveProductCount: products.filter((p) => p.isPublished).length,
      liveServiceCount: services.filter((p) => p.isPublished).length,
      liveShowCount: shows.filter((s) => s.isPublic).length,
    },
    products,
    services,
    shows,
    catalogTotal: catalog.total,
  };
}

function requireAdminReason(reason) {
  const r = typeof reason === 'string' ? reason.trim() : '';
  if (r.length < 8) {
    const err = new Error('Admin support reason required (min 8 characters)');
    err.statusCode = 400;
    err.code = 'admin_reason_required';
    throw err;
  }
  return r;
}

async function invalidateLiveStore(prisma, store) {
  if (store?.isActive) {
    try {
      await bumpPublicFeedRankForStore(prisma, store.id, { reason: 'admin_store_content_mutation' });
    } catch {
      /* non-fatal */
    }
  }
}

export async function adminUnpublishProduct(prisma, { storeId, productId, actorUserId, reason }) {
  const adminReason = requireAdminReason(reason);
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, isActive: true, name: true },
  });
  if (!store) {
    const err = new Error('Store not found');
    err.statusCode = 404;
    err.code = 'store_not_found';
    throw err;
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, businessId: storeId, deletedAt: null },
  });
  if (!product) {
    const err = new Error('Product not found');
    err.statusCode = 404;
    err.code = 'product_not_found';
    throw err;
  }

  const updated = await prisma.product.update({
    where: { id: product.id },
    data: { isPublished: false },
  });

  await invalidateLiveStore(prisma, store);

  console.log('[admin/store-content] product unpublished', {
    storeId,
    productId,
    actorUserId,
    reason: adminReason,
    timestamp: new Date().toISOString(),
  });

  return { product: updated, storeId, removedFromLive: Boolean(product.isPublished) };
}

export async function adminSoftDeleteProduct(prisma, { storeId, productId, actorUserId, reason }) {
  const adminReason = requireAdminReason(reason);
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, isActive: true, name: true },
  });
  if (!store) {
    const err = new Error('Store not found');
    err.statusCode = 404;
    err.code = 'store_not_found';
    throw err;
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, businessId: storeId, deletedAt: null },
  });
  if (!product) {
    const err = new Error('Product not found');
    err.statusCode = 404;
    err.code = 'product_not_found';
    throw err;
  }

  const deleted = await prisma.product.update({
    where: { id: product.id },
    data: { deletedAt: new Date(), isPublished: false },
  });

  await invalidateLiveStore(prisma, store);

  console.log('[admin/store-content] product soft-deleted', {
    storeId,
    productId,
    actorUserId,
    reason: adminReason,
    timestamp: new Date().toISOString(),
  });

  return { product: deleted, storeId };
}

export async function adminDeleteStoreContent(prisma, { storeId, actorUserId, reason }) {
  const adminReason = requireAdminReason(reason);
  const deleted = await adminDeleteStore(prisma, storeId, {
    actorUserId,
    reason: adminReason,
  });
  return {
    deleted: deleted.id,
    name: deleted.name,
    slug: deleted.slug,
  };
}
