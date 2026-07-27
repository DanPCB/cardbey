# Stripe Payment Integration Audit

**Date:** 2026-07-07  
**Scope:** Locate previous Cardbey Stripe code; plan reuse for customer journey payments.

## Summary

**No full Stripe checkout / PaymentIntent / webhook implementation exists in this repository or git history.** The previous Cardbey app Stripe surface in this monorepo is limited to promotion coupons and POS payment ledger entries—not customer-facing storefront payments.

## Files found

| Path | Role | Reusable? |
|------|------|-----------|
| `apps/core/cardbey-core/src/lib/externalActions/index.js` | `createStripePromotion()` — Stripe coupon via `STRIPE_SECRET_KEY` | Pattern only (client init, env guard) |
| `apps/core/cardbey-core/src/lib/business/paymentService.js` | `recordPayment()` — internal POS/commerce ledger | Extend for journey payments |
| `apps/core/cardbey-core/src/lib/toolExecutors/business/record_payment.js` | MI tool wrapper for `recordPayment` | Keep; not Stripe |
| `apps/core/cardbey-core/src/routes/billing.js` | AI credits balance (`/api/billing/balance`) | Unrelated to Stripe checkout |
| `apps/core/cardbey-core/src/routes/miToolsRoutes.js` | `/payment/intent/create` → **501 Not Implemented** | Replace with real module |
| `apps/core/cardbey-core/prisma/*/schema.prisma` | `Payment` model (POS: `posOrderId`, `method`, `externalRef`) | **Extend** with Stripe + journey fields |
| `apps/core/cardbey-core/package.json` | `stripe` ^22.0.1 | Reuse |
| `apps/dashboard/.../features/booking/bookingApi.ts` | `postBookingCheckout` **stub** | Replace with payment-aware flow |
| `apps/dashboard/.../customerJourneyApi.ts` | Journey submit (quote/booking stub) | **Integrate payment step** |

## Not found (previous app / history)

- `loadStripe`, `@stripe/stripe-js`, `PaymentElement`, `CheckoutProvider`
- `payment_intent.succeeded` webhook handler
- `checkout.session.completed` handler
- `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` in `.env.example`
- Frontend payment components
- Storefront booking checkout API (only MI `/api/mi/booking/*`)

## Environment variables

| Variable | Status | Notes |
|----------|--------|-------|
| `STRIPE_SECRET_KEY` | Used by coupon helper only | Server-only |
| `STRIPE_PUBLISHABLE_KEY` | **Missing** | Add; expose to frontend as `VITE_STRIPE_PUBLISHABLE_KEY` |
| `STRIPE_WEBHOOK_SECRET` | **Missing** | Required for webhook signature verification |
| `STRIPE_CURRENCY_DEFAULT` | **Missing** | Default `AUD` |

## Database models

**Existing `Payment`:** `storeId`, `posOrderId`, `method`, `status`, `amount`, `currency`, `externalRef`, `metadata`.

**Existing `Booking`:** `status` pending \| confirmed \| cancelled \| completed; no `paymentStatus`.

**Gap:** Journey-linked Stripe IDs, `purpose`, `linkedEntityType` / `linkedEntityId`, `customerId`.

## What is reusable

1. `stripe` npm package and `createStripePromotion` client bootstrap pattern
2. `recordPayment` + `Payment` Prisma model (extend, don't duplicate)
3. `createBooking` in `bookingService.js` for pending bookings
4. `createQuoteRequest` for non-payment quote flows
5. Governance: `safeExecutionGovernance` already lists `payment` as confirmation-required action

## What is outdated / must be rewritten

1. **All storefront checkout** — currently stubbed on dashboard
2. **MI-only booking routes** — need public `POST /api/public/stores/:storeId/bookings` for journeys
3. **Payment model** — POS-shaped; needs Stripe journey fields
4. **No webhook route** — must mount with raw body before `express.json()`

## New build architecture (this PR)

```
CustomerJourneyDrawer
  → form step
  → payment step (if required)
  → success

Backend:
  resolveJourneyPaymentAmount()  // server-side amount
  createPaymentIntent()
  payment webhook → confirm linked booking/order
```

## Journey payment matrix

| Journey | Payment default | Purpose |
|---------|-----------------|---------|
| Fixed booking | If `price > 0` and `requiresUpfrontPayment` | `booking_payment` |
| Inspection | If `inspectionFee > 0` | `inspection_fee` |
| Consultation | If `consultationFee > 0` | `consultation_fee` |
| Quote request | No | — |
| Retail cart | Yes when checkout | `order_payment` |
| Food order | If online payment enabled | `order_payment` |
| Quote acceptance deposit | Later | `quote_acceptance_deposit` |

## Risk / impact

| Risk | Mitigation |
|------|------------|
| Frontend amount tampering | Backend-only amount resolution |
| Webhook forgery | Signature verification + raw body |
| Premature booking confirm | Status `pending_payment` until `payment_intent.succeeded` |
| Schema migration on live | Additive nullable columns on `Payment` |

## Smallest safe patch

1. Extend `Payment` model (additive migration)
2. Add `src/lib/payments/*` + routes
3. Mount webhook before JSON parser
4. Add dashboard payment step to `CustomerJourneyDrawer`
5. Public booking + journey prepare endpoints
