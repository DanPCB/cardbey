/**
 * Service catalog + quote request API routes.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { rateLimitMiddleware } from '../services/reliability/rateLimitMiddleware.js';
import { enrichPublicCatalogItem } from '../lib/catalog/catalogItemClassification.js';
import { migrateServiceCatalogItems } from '../lib/catalog/serviceCatalogNormalizer.js';
import {
  countNewQuoteRequests,
  createQuoteRequest,
  getQuoteRequestsForStore,
  updateQuoteRequest,
} from '../lib/quoteRequest/quoteRequestService.js';

const publicRouter = Router({ mergeParams: true });
const ownerRouter = Router({ mergeParams: true });

const quoteSubmitLimit = rateLimitMiddleware({
  endpoint: '/api/public/stores/:storeId/quote-requests',
  windowMs: 60_000,
  maxRequests: 20,
  perUser: false,
});

const QuoteSubmitSchema = z.object({
  serviceId: z.string().trim().optional().nullable(),
  customerName: z.string().trim().min(1),
  customerEmail: z.string().trim().email(),
  customerPhone: z.string().trim().optional().nullable(),
  description: z.string().trim().min(3),
  address: z.string().trim().optional().nullable(),
  preferredDate: z.string().trim().optional().nullable(),
  preferredTime: z.string().trim().optional().nullable(),
  consultationType: z.string().trim().optional().nullable(),
  journeyIntent: z
    .enum([
      'request_quote',
      'book_inspection',
      'book_consultation',
      'request_callback',
      'upload_project_details',
    ])
    .optional()
    .nullable(),
  uploadedFiles: z.array(z.string()).optional().nullable(),
  approximateSize: z.string().trim().optional().nullable(),
  budget: z.number().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

const QuotePatchSchema = z.object({
  status: z.enum(['new', 'reviewing', 'quoted', 'accepted', 'declined', 'completed']).optional(),
  quoteAmount: z.number().optional().nullable(),
  quoteMessage: z.string().trim().optional().nullable(),
});

async function requireStoreOwner(req, res, next) {
  try {
    const storeId = String(req.params.storeId ?? '').trim();
    if (!storeId) {
      return res.status(400).json({ ok: false, error: 'storeId required' });
    }
    const prisma = getPrismaClient();
    const store = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, userId: true, name: true, type: true },
    });
    if (!store) {
      return res.status(404).json({ ok: false, error: 'store_not_found' });
    }
    if (store.userId !== req.userId) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    req.storeRecord = store;
    next();
  } catch (err) {
    next(err);
  }
}

/** GET /api/public/stores/:storeId/service-catalog */
publicRouter.get('/:storeId/service-catalog', async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId ?? '').trim();
    const prisma = getPrismaClient();
    const store = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, type: true, isActive: true },
    });
    if (!store || store.isActive === false) {
      return res.status(404).json({ ok: false, error: 'store_not_found' });
    }

    const products = await prisma.product.findMany({
      where: { businessId: storeId, isPublished: true, deletedAt: null },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    const ctx = { businessType: store.type, businessName: store.name, storeId };
    const enriched = products.map((p) =>
      enrichPublicCatalogItem(
        {
          id: p.id,
          storeId,
          title: p.name,
          name: p.name,
          description: p.description,
          imageUrl: p.imageUrl,
          price: p.price,
          currency: p.currency,
          category: p.category,
          itemType: p.itemType,
          bookingEnabled: p.bookingEnabled,
          purchaseEnabled: p.purchaseEnabled,
          primaryAction: p.primaryAction,
          serviceCatalog: p.serviceCatalog,
        },
        ctx,
      ),
    );

    const { items } = migrateServiceCatalogItems(enriched, ctx);
    const bookable = items.filter((i) => i.executionAction === 'book' || i.serviceMode === 'fixed_booking');
    const quoteRequired = items.filter(
      (i) => i.executionAction === 'request_quote' || i.serviceMode === 'quote_required',
    );
    const productsOnly = items.filter((i) => i.type === 'product' || i.executionAction === 'add_to_cart');

    return res.json({
      ok: true,
      storeId,
      items,
      sections: {
        bookable,
        quoteRequired,
        products: productsOnly,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/public/stores/:storeId/quote-requests */
publicRouter.post('/:storeId/quote-requests', quoteSubmitLimit, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId ?? '').trim();
    const parsed = QuoteSubmitSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_error', details: parsed.error.flatten() });
    }

    const prisma = getPrismaClient();
    const store = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, isActive: true },
    });
    if (!store || store.isActive === false) {
      return res.status(404).json({ ok: false, error: 'store_not_found' });
    }

    const row = await createQuoteRequest({
      storeId,
      ...parsed.data,
      customerId: req.userId ?? null,
      metadata: {
        ...(parsed.data.metadata && typeof parsed.data.metadata === 'object' ? parsed.data.metadata : {}),
        journeyIntent: parsed.data.journeyIntent ?? parsed.data.metadata?.journeyIntent ?? null,
        preferredTime: parsed.data.preferredTime ?? null,
        consultationType: parsed.data.consultationType ?? null,
      },
    });

    return res.status(201).json({
      ok: true,
      quoteRequest: row,
      message: 'Your quote request has been sent. The business will respond shortly.',
    });
  } catch (err) {
    next(err);
  }
});

ownerRouter.use(requireAuth, requireStoreOwner);

/** GET /api/stores/:storeId/quote-requests */
ownerRouter.get('/', async (req, res, next) => {
  try {
    const status = req.query.status != null ? String(req.query.status) : undefined;
    const result = await getQuoteRequestsForStore(req.params.storeId, {
      status,
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
    });
    const newCount = await countNewQuoteRequests(req.params.storeId);
    return res.json({ ok: true, ...result, newCount });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/stores/:storeId/quote-requests/:quoteRequestId */
ownerRouter.patch('/:quoteRequestId', async (req, res, next) => {
  try {
    const parsed = QuotePatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_error', details: parsed.error.flatten() });
    }
    const updated = await updateQuoteRequest(
      req.params.storeId,
      req.params.quoteRequestId,
      parsed.data,
    );
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'quote_request_not_found' });
    }
    return res.json({ ok: true, quoteRequest: updated });
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    next(err);
  }
});

export { publicRouter as serviceCatalogPublicRoutes, ownerRouter as quoteRequestOwnerRoutes };
