/**
 * MI Tool Contract v1 routes.
 * Mounted at /mi/v1. Uses standard request/response envelope.
 * Read-only: store/search, store/get-public, catalog/list, availability/get (stub).
 * All other endpoints return 501 with envelope.
 * Does NOT touch existing store creation/draft/publish logic.
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { toPublicStore } from '../utils/publicStoreMapper.js';

const router = express.Router();
const prisma = new PrismaClient();

const VALID_ROLES = ['buyer', 'seller', 'admin', 'system'];
const VALID_CHANNELS = ['web', 'mobile', 'kiosk', 'api', 'agent'];

/** Map frontscreen category (food|product|service) to Business.type values. Reused from publicUsers. */
const FEED_CATEGORY_TYPES = {
  food: [
    'restaurant', 'cafe', 'food', 'dining', 'bakery', 'bistro', 'bar', 'coffee', 'kitchen',
    'general', 'vietnamese take away shop', 'Vietnamese take away shop', 'Vietnamese Take Away Shop', 'take away', 'takeaway', 'vietnamese', 'banh mi', 'pho',
    'eatery', 'fast food', 'fast food restaurant',
  ],
  products: ['retail', 'shop', 'store', 'florist', 'product', 'merchandise', 'general', 'business'],
  services: [
    'service', 'services', 'salon', 'Salon', 'beauty', 'nails', 'Nails', 'spa', 'barber', 'hair', 'hairdresser',
    'cleaning', 'home_cleaning', 'repair', 'mechanic', 'clinic', 'dentist', 'physio', 'wellness',
    'office', 'nail_salon', 'nail salon',
  ],
};

function envelope(requestId, ok, data, options = {}) {
  const {
    requiresAuth = false,
    authGate = null,
    requiredFields = [],
    warnings = [],
    error = null,
  } = options;
  return {
    requestId: requestId || 'unknown',
    ok,
    data: data ?? {},
    requiresAuth,
    authGate,
    requiredFields,
    warnings,
    error,
  };
}

/**
 * Parse and validate MI request body. Returns { requestId, actor, context, input } or null and sends 400.
 */
function parseMIRequest(req, res) {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    res.status(400).json(envelope('unknown', false, {}, { error: { code: 'VALIDATION_ERROR', message: 'Request body must be JSON object', details: {} } }));
    return null;
  }
  const requestId = typeof body.requestId === 'string' ? body.requestId : 'unknown';
  const actor = body.actor;
  const context = body.context;
  const input = body.input;
  if (!actor || typeof actor !== 'object' || !VALID_ROLES.includes(actor.role)) {
    res.status(400).json(envelope(requestId, false, {}, { error: { code: 'VALIDATION_ERROR', message: 'actor.role is required and must be one of: buyer, seller, admin, system', details: {} } }));
    return null;
  }
  if (!context || typeof context !== 'object') {
    res.status(400).json(envelope(requestId, false, {}, { error: { code: 'VALIDATION_ERROR', message: 'context is required', details: {} } }));
    return null;
  }
  if (!VALID_CHANNELS.includes(context.channel)) {
    res.status(400).json(envelope(requestId, false, {}, { error: { code: 'VALIDATION_ERROR', message: 'context.channel must be one of: web, mobile, kiosk, api, agent', details: {} } }));
    return null;
  }
  if (input === undefined || (input !== null && typeof input !== 'object')) {
    res.status(400).json(envelope(requestId, false, {}, { error: { code: 'VALIDATION_ERROR', message: 'input must be an object', details: {} } }));
    return null;
  }
  return { requestId, actor, context, input: input ?? {} };
}

function ok(res, requestId, data, warnings = []) {
  return res.status(200).json(envelope(requestId, true, data, { warnings }));
}

function fail(res, requestId, code, message, details = {}, status = 400) {
  return res.status(status).json(envelope(requestId, false, {}, { error: { code, message, details } }));
}

function notImplemented(res, requestId, toolName) {
  return res.status(501).json(envelope(requestId, false, {}, {
    error: { code: 'TEMPORARY_UNAVAILABLE', message: `${toolName} is not implemented yet`, details: {} },
  }));
}

function authRequired(res, requestId, message) {
  return res.status(401).json(envelope(requestId, false, {}, {
    requiresAuth: true,
    authGate: 'Gate1',
    requiredFields: ['fullName', 'email', 'phone'],
    error: { code: 'NOT_AUTHENTICATED', message: message || 'Authentication required', details: {} },
  }));
}

// ---------- POST /store/search ----------
router.post('/store/search', async (req, res, next) => {
  try {
    const parsed = parseMIRequest(req, res);
    if (!parsed) return;
    const { requestId, input } = parsed;
    const query = input.query;
    const storeType = input.storeType; // food | product | service
    const limit = Math.min(Math.max(1, parseInt(input.limit, 10) || 20), 100);
    const cursorRaw = input.cursor || null;

    const orderBy = [{ createdAt: 'desc' }, { id: 'desc' }];
    const select = { id: true, name: true, slug: true, type: true, createdAt: true, logo: true, heroImageUrl: true, avatarImageUrl: true, stylePreferences: true };
    const where = { isActive: true };
    if (storeType && FEED_CATEGORY_TYPES[storeType]) {
      where.type = { in: FEED_CATEGORY_TYPES[storeType] };
    }
    if (query && typeof query === 'string' && query.trim()) {
      where.OR = [
        { name: { contains: query.trim(), mode: 'insensitive' } },
        { slug: { contains: query.trim(), mode: 'insensitive' } },
      ];
    }

    let cursor = null;
    if (cursorRaw && typeof cursorRaw === 'string') {
      try {
        const decoded = JSON.parse(Buffer.from(cursorRaw, 'base64').toString('utf8'));
        if (decoded.createdAt && decoded.id) cursor = { createdAt: new Date(decoded.createdAt), id: decoded.id };
      } catch { /* ignore */ }
    }

    const take = limit + 1;
    const businesses = cursor
      ? await prisma.business.findMany({ where, orderBy, cursor, skip: 1, take, select })
      : await prisma.business.findMany({ where, orderBy, take, select });

    const hasMore = businesses.length > limit;
    const list = hasMore ? businesses.slice(0, limit) : businesses;
    const stores = list.map((b) => {
      const mapped = toPublicStore(b);
      return {
        storeId: mapped.id,
        slug: mapped.slug ?? null,
        storeType: normalizeStoreType(mapped.type),
        name: mapped.name,
        heroUrl: mapped.heroUrl ?? mapped.bannerUrl ?? null,
      };
    });
    let nextCursor = null;
    if (hasMore && list.length) {
      const lastB = businesses[limit - 1];
      nextCursor = Buffer.from(JSON.stringify({ createdAt: lastB.createdAt.toISOString(), id: lastB.id })).toString('base64');
    }
    return ok(res, requestId, { stores, nextCursor });
  } catch (err) {
    next(err);
  }
});

// ---------- POST /store/get-public ----------
router.post('/store/get-public', async (req, res, next) => {
  try {
    const parsed = parseMIRequest(req, res);
    if (!parsed) return;
    const { requestId, input } = parsed;
    const storeIdOrSlug = input.storeIdOrSlug;
    if (!storeIdOrSlug || typeof storeIdOrSlug !== 'string') {
      return fail(res, requestId, 'VALIDATION_ERROR', 'input.storeIdOrSlug is required', {}, 400);
    }
    const idOrSlug = storeIdOrSlug.trim();
    const business = await prisma.business.findFirst({
      where: {
        isActive: true,
        OR: [{ id: idOrSlug }, { slug: idOrSlug.toLowerCase() }],
      },
      select: { id: true, name: true, slug: true, type: true, logo: true, heroImageUrl: true, avatarImageUrl: true, stylePreferences: true },
    });
    if (!business) {
      return fail(res, requestId, 'NOT_FOUND', 'Store not found', {}, 404);
    }
    const mapped = toPublicStore(business);
    const store = {
      storeId: mapped.id,
      slug: mapped.slug ?? '',
      storeType: normalizeStoreType(mapped.type),
      name: mapped.name,
      heroUrl: mapped.heroUrl ?? mapped.bannerUrl ?? null,
    };
    return ok(res, requestId, { store });
  } catch (err) {
    next(err);
  }
});

function normalizeStoreType(type) {
  if (!type) return 'product';
  const t = String(type).toLowerCase();
  if (FEED_CATEGORY_TYPES.food.some((x) => x.toLowerCase() === t)) return 'food';
  if (FEED_CATEGORY_TYPES.services.some((x) => x.toLowerCase() === t)) return 'service';
  return 'product';
}

// ---------- POST /catalog/list ----------
router.post('/catalog/list', async (req, res, next) => {
  try {
    const parsed = parseMIRequest(req, res);
    if (!parsed) return;
    const { requestId, input } = parsed;
    const storeId = input.storeId;
    const kind = input.kind || 'any'; // product | service | any
    const category = input.category;
    const includeInactive = !!input.includeInactive;

    if (!storeId || typeof storeId !== 'string') {
      return fail(res, requestId, 'VALIDATION_ERROR', 'input.storeId is required', {}, 400);
    }

    const business = await prisma.business.findFirst({
      where: { id: storeId, isActive: true },
      select: {
        id: true,
        type: true,
        products: {
          where: includeInactive ? { deletedAt: null } : { isPublished: true, deletedAt: null },
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true, description: true, imageUrl: true, category: true, price: true, currency: true },
        },
      },
    });
    if (!business) {
      return fail(res, requestId, 'NOT_FOUND', 'Store not found', {}, 404);
    }

    const storeKind = normalizeStoreType(business.type); // 'food' | 'product' | 'service'
    let products = business.products || [];
    if (category && typeof category === 'string') {
      const catNorm = category.trim();
      products = products.filter((p) => (p.category && String(p.category).trim()) === catNorm);
    }
    const categories = [...new Set(products.map((p) => (p.category && String(p.category).trim()) || 'Other').filter(Boolean))];
    const itemKind = storeKind === 'service' ? 'service' : 'product';
    if (kind !== 'any') {
      const want = kind === 'service' ? 'service' : 'product';
      if (itemKind !== want) {
        products = [];
      }
    }
    const items = products.map((p) => ({
      itemId: p.id,
      storeId: business.id,
      kind: itemKind,
      title: p.name,
      description: p.description ?? null,
      imageUrl: p.imageUrl ?? null,
      category: p.category ?? null,
      price: {
        amount: p.price != null ? Math.round(Number(p.price) * 100) : 0,
        currency: (p.currency && String(p.currency)) || 'USD',
      },
      durationMin: itemKind === 'service' ? 30 : null,
      isActive: true,
    }));
    return ok(res, requestId, { items, categories });
  } catch (err) {
    next(err);
  }
});

// ---------- POST /availability/get (stub) ----------
router.post('/availability/get', async (req, res, next) => {
  try {
    const parsed = parseMIRequest(req, res);
    if (!parsed) return;
    const { requestId, input } = parsed;
    const date = input.date; // YYYY-MM-DD
    const timezone = input.timezone;
    if (!date || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) {
      return fail(res, requestId, 'VALIDATION_ERROR', 'input.date is required (YYYY-MM-DD)', {}, 400);
    }
    const staffOptions = [{ staffId: 'any', name: 'Any available' }];
    const timeSlots = [];
    for (let h = 9; h < 17; h++) {
      for (const m of [0, 30]) {
        const start = `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
        const endH = m === 30 ? h + 1 : h;
        const endM = m === 30 ? 0 : 30;
        const end = `${date}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00.000Z`;
        timeSlots.push({ start, end, available: true });
      }
    }
    return ok(res, requestId, { staffOptions, timeSlots }, ['availability.get.v1 is stubbed (static 9–5 slots)']);
  } catch (err) {
    next(err);
  }
});

// ---------- 501 placeholders ----------
const NOT_IMPLEMENTED_PATHS = [
  ['/booking/draft/create', 'booking.draft.create'],
  ['/booking/draft/update', 'booking.draft.update'],
  ['/booking/price', 'booking.price'],
  ['/booking/confirm', 'booking.confirm'],
  ['/order/draft/create', 'order.draft.create'],
  ['/order/draft/update', 'order.draft.update'],
  ['/order/price', 'order.price'],
  ['/order/confirm', 'order.confirm'],
  ['/payment/intent/create', 'payment.intent.create'],
  ['/promo/qr/create', 'promo.qr.create'],
  ['/store/publish', 'store.publish'],
];

NOT_IMPLEMENTED_PATHS.forEach(([pathName, toolName]) => {
  router.post(pathName, (req, res) => {
    const body = req.body;
    const requestId = (body && typeof body.requestId === 'string') ? body.requestId : 'unknown';
    return notImplemented(res, requestId, toolName);
  });
});

export default router;
