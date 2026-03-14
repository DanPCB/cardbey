# Intent Capture Layer MVP — Implementation Summary

## Overview

MVP adds: **Public Offer Page** (HTML), **Store Intent Feed** (JSON), **Dynamic QR redirect** (`/q/:code`), and **basic analytics** (page view + QR scan). Offer creation is **only** from Mission Execution (single runway); outcome pages do not create offers.

---

## Part A — Audit (Done)

- **Business**: exists; published = `isActive === true`.
- **StorePromo**: exists for promos/landing; kept separate from generic offers.
- **DynamicQr**: exists; reused for offer QR (type `'offer'`, `targetPath` = offer page path).
- **ScanEvent**: exists for QR scan analytics.
- **Decision**: New **StoreOffer** model (Intent Capture); new **IntentSignal** model; **no** separate PublicCode (use DynamicQr).

---

## Part B — Data Model

### New models (both SQLite and Postgres schemas)

**StoreOffer** (Intent Capture; name avoids clash with existing campaign `Offer` model)

- `id`, `storeId` (→ Business), `slug` (unique per store), `title`, `description`, `priceText`, `startsAt`, `endsAt`, `isActive`, `createdAt`, `updatedAt`.

**IntentSignal**

- `id`, `type` (`"page_view"` | `"qr_scan"`), `storeId`, `offerId?`, `code?`, `userAgent?`, `referrer?`, `createdAt`.

**Business** relation: added `storeOffers StoreOffer[]`.

---

## Part C — Backend Routes

| Method + Path | Auth | Description |
|---------------|------|-------------|
| `GET /p/:storeSlug/offers/:offerSlug` | None | Public offer page (HTML, OpenGraph, JSON-LD). Records `IntentSignal` type `page_view`. |
| `GET /api/public/stores/:storeId/intent-feed` | None | JSON: store + offers with `url`, `qrUrl` per offer. |
| `GET /q/:code` | None | Resolve DynamicQr; create ScanEvent + IntentSignal `qr_scan`; **302** redirect to offer page (or fallback). |
| `GET /api/stores/:id/intent-signals` | Auth, store owner | Counts: `pageViews`, `qrScans` for dashboard. |

**QR create**: `type` `'offer'` added in `qr.js` (create + PATCH).

---

## Part D — Orchestrator (Single Runway)

- **Intent type**: `create_offer`.
- **Handler**: in `miIntentsRoutes.js` POST `.../intents/:intentId/run`. Requires `payload.storeId`. Creates **StoreOffer** + **DynamicQr** (type `'offer'`, `targetPath` = `/p/:storeSlug/offers/:offerSlug`, `payload` = `{ offerId, storeSlug, offerSlug }`). Returns `publicUrl`, `qrUrl`, `offerId`, `storeId`.
- **No** offer creation from outcome/dashboard pages; only from this intent run.

---

## Part E — Dashboard

- **Mission Execution**: “Create first offer” button (when mission has `report.storeId` or `artifacts.storeId`). Creates intent with `type: 'create_offer'`, `payload: { storeId }`; user runs it from Mission Inbox.
- **After run**: Inbox shows for completed `create_offer`: **Offer page** link, **QR link**, **View signals** (counts from `GET /api/stores/:id/intent-signals`).

---

## Files Changed

### Backend (core)

- `prisma/sqlite/schema.prisma` — StoreOffer, IntentSignal; Business.storeOffers.
- `prisma/postgres/schema.prisma` — Same.
- `src/routes/publicOfferPage.js` — **New**: GET `/p/:storeSlug/offers/:offerSlug`.
- `src/routes/intentFeedRoutes.js` — **New**: GET `/api/public/stores/:storeId/intent-feed`.
- `src/routes/qRedirect.js` — **New**: GET `/q/:code` (302 + ScanEvent + IntentSignal).
- `src/routes/miIntentsRoutes.js` — `create_offer` branch; include `result` in GET intents list.
- `src/routes/qr.js` — Allow `type` `'offer'` in create/PATCH.
- `src/routes/stores.js` — GET `/:id/intent-signals`.
- `src/server.js` — Mount `intentFeedRoutes`, `publicOfferPage`, `qRedirect`.

### Frontend (dashboard)

- `src/lib/missionIntent.ts` — `create_offer` type/label; `result` in list type; `getStoreIntentSignals()`.
- `src/app/console/ExecutionDrawer.tsx` — Create first offer button, result links + signals for completed `create_offer`, intents include `result`.

---

## URLs to Test

1. **Public offer page**: `GET https://<host>/p/<storeSlug>/offers/<offerSlug>` (no auth).
2. **Intent feed**: `GET https://<host>/api/public/stores/<storeId>/intent-feed` (no auth).
3. **QR redirect**: `GET https://<host>/q/<code>` → 302 to offer page (no auth).
4. **Signals (dashboard)**: `GET https://<host>/api/stores/<storeId>/intent-signals` (auth, store owner).

---

## DB Migrations

1. **SQLite** (e.g. dev):
   ```bash
   cd apps/core/cardbey-core
   npx prisma generate --schema=prisma/sqlite/schema.prisma
   npx prisma db push --schema=prisma/sqlite/schema.prisma
   ```
2. **Postgres** (e.g. prod):
   ```bash
   npx prisma generate --schema=prisma/postgres/schema.prisma
   npx prisma migrate dev --schema=prisma/postgres/schema.prisma --name intent_capture_store_offer_and_signals
   ```
   Or use `db push` if not using migrations.

---

## Verification (Manual)

1. Create and publish a store (Business `isActive = true`).
2. In Mission Execution, click “Create first offer”, then **Run** the created intent.
3. Visit the **public offer URL** (no auth) → page loads (title, price, description, store name, location, CTA).
4. Visit **`/api/public/stores/:id/intent-feed`** → JSON with offer and URLs.
5. Visit **`/q/:code`** → 302 to offer page.
6. Confirm **signals**: offer page view and QR scan recorded; “View signals” in dashboard shows counts.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking store creation/publish | No changes to publish flow or draft resolution; new routes and models only. |
| Second runway (offers created outside Mission) | Offer + DynamicQr created only in `create_offer` intent run in `miIntentsRoutes.js`. |
| Public routes abuse | Intent feed and offer page are read-only; signals are append-only. Rate-limit at gateway if needed. |
| Slug collision | Offer `@@unique([storeId, slug])`; slug derived from title with safe chars. |
| Missing storeId in mission | “Create first offer” only shown when `mission.report?.storeId ?? mission.artifacts?.storeId` is set (after store creation/publish). |
