/**
 * Payment API routes — PaymentIntent, Checkout Session, status.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireStoreOwner } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { createPaymentIntentForJourney, getPaymentStatus } from '../lib/payments/paymentIntentService.js';
import { createCheckoutSession } from '../lib/payments/checkoutSessionService.js';
import { isStripeConfigured, getPublishableKey } from '../lib/payments/stripeClient.js';
import { PAYMENT_PURPOSES } from '../lib/payments/paymentTypes.js';
import { purposeForJourneyIntent, resolveBookingCartPaymentAmount } from '../lib/payments/paymentAmountResolver.js';
import { createBooking } from '../lib/booking/bookingService.js';
import { createQuoteRequest } from '../lib/quoteRequest/quoteRequestService.js';
import { rateLimitMiddleware } from '../services/reliability/rateLimitMiddleware.js';

const router = Router();
const publicJourneyRouter = Router({ mergeParams: true });

const paymentLimit = rateLimitMiddleware({
  endpoint: '/api/payments/create-intent',
  windowMs: 60_000,
  maxRequests: 30,
  perUser: false,
});

const CreateIntentSchema = z.object({
  storeId: z.string().trim().min(1),
  purpose: z.enum(PAYMENT_PURPOSES),
  serviceId: z.string().trim().optional().nullable(),
  journeyIntent: z.string().trim().optional().nullable(),
  linkedEntityType: z.enum(['booking', 'quote_request', 'pos_order', 'journey']).optional().nullable(),
  linkedEntityId: z.string().trim().optional().nullable(),
  journeyId: z.string().trim().optional().nullable(),
  catalogItem: z.record(z.unknown()).optional().nullable(),
  /** Ignored for amount — server resolves from catalogItem */
  clientAmount: z.number().optional().nullable(),
});

const CheckoutSessionSchema = z.object({
  storeId: z.string().trim().min(1),
  purpose: z.enum(PAYMENT_PURPOSES).default('order_payment'),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  lineItems: z
    .array(
      z.object({
        name: z.string(),
        amount: z.number().positive(),
        quantity: z.number().int().positive().default(1),
      }),
    )
    .optional(),
  linkedEntityType: z.string().optional().nullable(),
  linkedEntityId: z.string().trim().optional().nullable(),
  catalogItem: z.record(z.unknown()).optional().nullable(),
});

const JourneySubmitSchema = z.object({
  journeyIntent: z.string().trim(),
  serviceId: z.string().trim().optional().nullable(),
  catalogItem: z.record(z.unknown()).optional().nullable(),
  customerName: z.string().trim().min(1),
  customerEmail: z.string().trim().email(),
  customerPhone: z.string().trim().optional().nullable(),
  projectDescription: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  preferredDate: z.string().trim().optional().nullable(),
  preferredTime: z.string().trim().optional().nullable(),
  consultationType: z.string().trim().optional().nullable(),
  approximateSize: z.string().trim().optional().nullable(),
  budget: z.number().optional().nullable(),
  uploadedFiles: z.array(z.string()).optional().nullable(),
  bookingType: z.enum(['appointment', 'inspection', 'consultation']).optional().nullable(),
});

const BookingSubmitSchema = z.object({
  services: z
    .array(
      z.object({
        serviceId: z.string().trim().min(1),
        name: z.string().optional(),
        price: z.number().optional(),
        duration: z.number().int().positive().optional(),
      }),
    )
    .min(1),
  staffId: z.string().trim().optional().nullable(),
  date: z.string().trim().min(1),
  time: z.string().trim().min(1),
  note: z.string().trim().optional().nullable(),
  customerName: z.string().trim().min(1),
  customerEmail: z.string().trim().email(),
  customerPhone: z.string().trim().optional().nullable(),
});

/** GET /api/payments/config — publishable key for frontend */
router.get('/config', (_req, res) => {
  res.json({
    ok: true,
    configured: isStripeConfigured(),
    publishableKey: getPublishableKey() || null,
  });
});

/** POST /api/payments/create-intent */
router.post('/create-intent', paymentLimit, async (req, res, next) => {
  try {
    const parsed = CreateIntentSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_error', details: parsed.error.flatten() });
    }

    const data = parsed.data;
    const prisma = getPrismaClient();
    const store = await prisma.business.findUnique({
      where: { id: data.storeId },
      select: { id: true, isActive: true },
    });
    if (!store || store.isActive === false) {
      return res.status(404).json({ ok: false, error: 'store_not_found' });
    }

    let catalogItem = data.catalogItem ?? {};
    if (data.serviceId) {
      const product = await prisma.product.findFirst({
        where: { id: data.serviceId, businessId: data.storeId },
      });
      if (product) {
        const sc =
          product.serviceCatalog && typeof product.serviceCatalog === 'object'
            ? product.serviceCatalog
            : {};
        catalogItem = {
          id: product.id,
          name: product.name,
          price: product.price,
          currency: product.currency,
          ...(sc && typeof sc === 'object' ? sc : {}),
          customServiceJourney:
            sc?.customServiceJourney ?? catalogItem.customServiceJourney,
          ...catalogItem,
        };
      }
    }

    const result = await createPaymentIntentForJourney({
      storeId: data.storeId,
      purpose: data.purpose,
      catalogItem,
      customerId: req.userId ?? null,
      journeyId: data.journeyId ?? null,
      linkedEntityType: data.linkedEntityType ?? null,
      linkedEntityId: data.linkedEntityId ?? null,
      metadata: { journeyIntent: data.journeyIntent ?? null },
    });

    if (!result.required) {
      return res.json({ ok: true, required: false, payment: null });
    }

    return res.status(201).json({
      ok: true,
      required: true,
      paymentId: result.payment.id,
      clientSecret: result.clientSecret,
      publishableKey: result.publishableKey,
      amount: result.amount,
      currency: result.currency,
      purpose: result.purpose,
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/payments/create-checkout-session */
router.post('/create-checkout-session', paymentLimit, async (req, res, next) => {
  try {
    const parsed = CheckoutSessionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_error', details: parsed.error.flatten() });
    }

    const result = await createCheckoutSession(parsed.data);
    return res.status(201).json({
      ok: true,
      paymentId: result.payment.id,
      sessionId: result.sessionId,
      url: result.url,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/payments/:paymentId/status */
router.get('/:paymentId/status', async (req, res, next) => {
  try {
    const payment = await getPaymentStatus(req.params.paymentId);
    return res.json({
      ok: true,
      payment: {
        id: payment.id,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        purpose: payment.purpose,
        linkedEntityType: payment.linkedEntityType,
        linkedEntityId: payment.linkedEntityId,
      },
    });
  } catch (err) {
    if (err?.code === 'NOT_FOUND') {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    next(err);
  }
});

/** POST /api/public/stores/:storeId/journey/submit */
publicJourneyRouter.post('/:storeId/journey/submit', paymentLimit, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId ?? '').trim();
    const parsed = JourneySubmitSchema.safeParse(req.body ?? {});
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

    const body = parsed.data;
    const intent = body.journeyIntent;
    const catalogItem = body.catalogItem ?? {};
    const isBooking =
      intent === 'book_inspection' ||
      intent === 'book_consultation' ||
      body.bookingType === 'inspection' ||
      body.bookingType === 'consultation' ||
      body.bookingType === 'appointment';

    let linkedEntityType = null;
    let linkedEntityId = null;

    if (isBooking) {
      const booking = await createBooking(prisma, {
        storeId,
        serviceId: body.serviceId ?? null,
        customerId: req.userId ?? null,
        customerName: body.customerName,
        customerEmail: body.customerEmail,
        customerPhone: body.customerPhone ?? null,
        date: body.preferredDate ?? new Date().toISOString().slice(0, 10),
        timeSlot: body.preferredTime ?? '09:00',
        notes: body.projectDescription ?? null,
        price: catalogItem.price != null ? Number(catalogItem.price) : null,
        sourceAgent: 'storefront',
        metadata: {
          journeyIntent: intent,
          bookingType: body.bookingType ?? null,
          consultationType: body.consultationType ?? null,
          address: body.address ?? null,
        },
      });
      linkedEntityType = 'booking';
      linkedEntityId = booking.id;

      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: 'pending_payment' },
      });
    } else {
      const quote = await createQuoteRequest({
        storeId,
        serviceId: body.serviceId ?? null,
        customerId: req.userId ?? null,
        customerName: body.customerName,
        customerEmail: body.customerEmail,
        customerPhone: body.customerPhone ?? null,
        description: body.projectDescription ?? 'Quote request',
        address: body.address ?? null,
        preferredDate: body.preferredDate ?? null,
        approximateSize: body.approximateSize ?? null,
        budget: body.budget ?? null,
        uploadedFiles: body.uploadedFiles ?? null,
        metadata: { journeyIntent: intent, preferredTime: body.preferredTime ?? null },
      });
      linkedEntityType = 'quote_request';
      linkedEntityId = quote.id;
    }

    const purpose = purposeForJourneyIntent(intent, body.bookingType ?? undefined);
    if (!purpose || !isBooking) {
      return res.status(201).json({
        ok: true,
        requiresPayment: false,
        linkedEntityType,
        linkedEntityId,
        message: isBooking ? 'Booking submitted' : 'Quote request submitted',
      });
    }

    const paymentResult = await createPaymentIntentForJourney({
      storeId,
      purpose,
      catalogItem,
      customerId: req.userId ?? null,
      linkedEntityType,
      linkedEntityId,
      metadata: { journeyIntent: intent },
    });

    if (!paymentResult.required) {
      if (linkedEntityType === 'booking' && linkedEntityId) {
        await prisma.booking.update({
          where: { id: linkedEntityId },
          data: { status: 'pending' },
        });
      }
      return res.status(201).json({
        ok: true,
        requiresPayment: false,
        linkedEntityType,
        linkedEntityId,
      });
    }

    return res.status(201).json({
      ok: true,
      requiresPayment: true,
      linkedEntityType,
      linkedEntityId,
      paymentId: paymentResult.payment.id,
      clientSecret: paymentResult.clientSecret,
      publishableKey: paymentResult.publishableKey,
      amount: paymentResult.amount,
      currency: paymentResult.currency,
      purpose: paymentResult.purpose,
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/public/stores/:storeId/booking/submit — fixed-service booking with optional payment */
publicJourneyRouter.post('/:storeId/booking/submit', paymentLimit, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId ?? '').trim();
    const parsed = BookingSubmitSchema.safeParse(req.body ?? {});
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

    const body = parsed.data;
    const catalogItems = [];
    let totalPrice = 0;
    let currency = null;

    for (const line of body.services) {
      const product = await prisma.product.findFirst({
        where: { id: line.serviceId, businessId: storeId },
      });
      if (!product) {
        return res.status(400).json({ ok: false, error: 'invalid_service', serviceId: line.serviceId });
      }
      const sc =
        product.serviceCatalog && typeof product.serviceCatalog === 'object' ? product.serviceCatalog : {};
      const catalogItem = {
        id: product.id,
        name: product.name,
        price: product.price,
        currency: product.currency,
        ...(sc && typeof sc === 'object' ? sc : {}),
      };
      catalogItems.push(catalogItem);
      totalPrice += Number(product.price ?? 0);
      currency = catalogItem.currency ?? currency;
    }

    const paymentPreview = resolveBookingCartPaymentAmount(catalogItems);
    const primaryService = body.services[0];
    const totalDuration = body.services.reduce((sum, s) => sum + (s.duration ?? 30), 0);

    const booking = await createBooking(prisma, {
      storeId,
      serviceId: primaryService.serviceId,
      staffId: body.staffId && body.staffId !== 'any' ? body.staffId : null,
      customerId: req.userId ?? null,
      customerName: body.customerName,
      customerEmail: body.customerEmail,
      customerPhone: body.customerPhone ?? null,
      date: body.date,
      timeSlot: body.time,
      durationMins: totalDuration,
      notes: body.note ?? null,
      price: totalPrice > 0 ? totalPrice : null,
      currency: currency ?? paymentPreview.currency,
      sourceAgent: 'storefront',
      metadata: {
        lineItems: body.services.map((s) => ({
          serviceId: s.serviceId,
          name: s.name ?? null,
          duration: s.duration ?? 30,
        })),
      },
    });

    if (!paymentPreview.required) {
      return res.status(201).json({
        ok: true,
        requiresPayment: false,
        bookingId: booking.id,
        linkedEntityType: 'booking',
        linkedEntityId: booking.id,
      });
    }

    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'pending_payment' },
    });

    const paymentResult = await createPaymentIntentForJourney({
      storeId,
      purpose: 'booking_payment',
      catalogItem: { price: paymentPreview.amount, currency: paymentPreview.currency, serviceMode: 'fixed_booking' },
      customerId: req.userId ?? null,
      linkedEntityType: 'booking',
      linkedEntityId: booking.id,
      metadata: { bookingId: booking.id, lineCount: body.services.length },
      orderTotal: paymentPreview.amount,
    });

    if (!paymentResult.required) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: 'pending' },
      });
      return res.status(201).json({
        ok: true,
        requiresPayment: false,
        bookingId: booking.id,
      });
    }

    return res.status(201).json({
      ok: true,
      requiresPayment: true,
      bookingId: booking.id,
      linkedEntityType: 'booking',
      linkedEntityId: booking.id,
      paymentId: paymentResult.payment.id,
      clientSecret: paymentResult.clientSecret,
      publishableKey: paymentResult.publishableKey,
      amount: paymentResult.amount,
      currency: paymentResult.currency,
      purpose: paymentResult.purpose,
    });
  } catch (err) {
    next(err);
  }
});

/** Owner: list payments for store */
const ownerRouter = Router({ mergeParams: true });
ownerRouter.use(requireAuth, requireStoreOwner);
ownerRouter.get('/', async (req, res, next) => {
  try {
    const prisma = getPrismaClient();
    const rows = await prisma.payment.findMany({
      where: { storeId: req.params.storeId, method: 'stripe' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ ok: true, payments: rows });
  } catch (err) {
    next(err);
  }
});

export { router as paymentRoutes, publicJourneyRouter as journeyPaymentRoutes, ownerRouter as paymentOwnerRoutes };
