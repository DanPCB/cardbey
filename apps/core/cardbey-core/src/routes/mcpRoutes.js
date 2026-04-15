/**
 * HTTP MCP-shaped **read-only** resources (Phase 0).
 *
 * BOUNDARY: These routes are for authenticated resource access, not a parallel orchestrator.
 * Business execution and sequencing remain in Mission Execution / pipeline / MI runtime.
 * Future MCP-backed **tools** should be invoked from server runtime (e.g. toolDispatcher
 * executors) using `lib/mcp` envelopes — not extended as UI-owned execution from the client.
 */
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';

const router = express.Router();
const prisma = getPrismaClient();

function parseIntQuery(val, { min, max, fallback }) {
  if (typeof val !== 'string') return fallback;
  const s = val.trim();
  if (!/^\d+$/.test(s)) return fallback;
  const n = parseInt(s, 10);
  if (Number.isFinite(n) && n >= min && n <= max) return n;
  return fallback;
}

function mapProductToMcpResource(p) {
  return {
    resourceType: 'product',
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    category: p.category ?? null,
    price: p.price ?? null,
    currency: p.currency ?? null,
    imageUrl: p.imageUrl ?? null,
    sku: p.sku ?? null,
    isPublished: Boolean(p.isPublished),
    updatedAt: p.updatedAt,
  };
}

/**
 * GET /mcp/resources/products
 * Read-only paginated list of products for the authenticated user's businesses.
 */
router.get('/resources/products', requireAuth, async (req, res, next) => {
  try {
    const limit = parseIntQuery(String(req.query?.limit ?? ''), { min: 1, max: 100, fallback: 20 });
    const offset = parseIntQuery(String(req.query?.offset ?? ''), { min: 0, max: 10_000_000, fallback: 0 });

    const userId = req.user?.id ? String(req.user.id).trim() : '';
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized', message: 'User id required' });

    const [total, products] = await Promise.all([
      prisma.product.count({
        where: { isPublished: true, business: { userId } },
      }),
      prisma.product.findMany({
        where: { isPublished: true, business: { userId } },
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          price: true,
          currency: true,
          imageUrl: true,
          sku: true,
          isPublished: true,
          updatedAt: true,
        },
      }),
    ]);

    const nextOffset = offset + products.length < total ? offset + products.length : null;

    return res.json({
      ok: true,
      resources: products.map(mapProductToMcpResource),
      pagination: { limit, offset, total, nextOffset },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /mcp/resources/products/:productId
 * Read-only product details for the authenticated user's businesses.
 */
router.get('/resources/products/:productId', requireAuth, async (req, res, next) => {
  try {
    const productId = typeof req.params.productId === 'string' ? req.params.productId.trim() : '';
    if (!productId) return res.status(400).json({ ok: false, error: 'validation', message: 'productId is required' });

    const userId = req.user?.id ? String(req.user.id).trim() : '';
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized', message: 'User id required' });

    const product = await prisma.product.findFirst({
      where: { id: productId, isPublished: true, business: { userId } },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        price: true,
        currency: true,
        imageUrl: true,
        sku: true,
        isPublished: true,
        updatedAt: true,
      },
    });

    if (!product) return res.status(404).json({ ok: false, error: 'not_found', message: 'Product not found' });

    return res.json({ ok: true, resource: mapProductToMcpResource(product) });
  } catch (err) {
    next(err);
  }
});

export default router;

