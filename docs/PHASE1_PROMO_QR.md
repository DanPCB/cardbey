# Phase 1: Smart Promo + QR — How to Use & Rollback

## How to use

### Create a QR Promo (modal)

1. **From Draft Review:** Open the store draft review → click the **⋮** overflow menu on the hero → **Create QR Promo**.  
2. **From Promotions page:** Go to **Dashboard → Store → Promotions** (or `/dashboard/stores/:storeId/promotions`) → click **Create QR Promo**.

In the modal:

- **Promo title** (required), e.g. “10% OFF Today”
- **Short description** (one line), optional
- **CTA text**, e.g. “Order now” (default: “Order now”)
- **Target:** Store-wide (default) or pick a product from the list
- **Coupon code**, optional (e.g. SAVE10)

Click **Create promo**. You get:

- **Promo link** (stable URL for packaging) + **Copy link**
- **QR preview** + **Download SVG** + **Download PNG** (SVG recommended for print)

Use the link or QR on packaging; when customers scan or open the link they see the promo landing page with title, description, CTA, and optional coupon. CTA goes to store (or product if target was a product).

### Public URL and landing

- **URL format:** `/{origin}/p/{slug}` (e.g. `https://yourapp.com/p/abc12`). Slug is generated on the server; id is used if slug is missing (legacy).
- **Landing page:** `/p/:promoId` (param is slug or id). No auth; shows promo banner, CTA, and optional coupon. Scan is tracked once per day per browser.

### Frontpage header (logged-in state)

- **Logged in:** Homepage (/) shows **Account** icon (user avatar) with menu: Dashboard, Account, Sign out. Login/Sign Up are hidden.
- **Logged out:** Login and Sign Up are shown as before.
- Auth is read once on mount via `useCurrentUser()` (same token as dashboard). No flash: loading shows a placeholder until resolved.

---

## Where promo is stored

- **Backend:** `StorePromo` table (Prisma). Fields include: storeId, productId (optional), title, subtitle, heroImageUrl, ctaLabel, targetUrl, slug (unique), code (coupon), isActive, scanCount, timestamps.
- **Endpoints:**  
  - Auth: `POST /api/promos`, `GET /api/promos?storeId=`, `PATCH /api/promos/:id`  
  - Public: `GET /api/public/promos/:slug`, `POST /api/public/promos/:slug/scan`
- **Dashboard:** `src/api/storePromos.ts` (create, list, getPromoLandingUrl, download QR PNG/SVG). Modal: `src/features/storeDraft/components/CreateQRPromoModal.tsx`. Entry points: Draft Review hero overflow “Create QR Promo”, Store Promotions page “Create QR Promo” button.

---

## Rollback steps

1. **Revert dashboard:** Remove Create QR Promo modal and entry points (CreateQRPromoModal.tsx, StoreReviewHero “Create QR Promo” button, StoreDraftReview modal state and CreateQRPromoModal render, StorePromotionsPage “Create QR Promo” button and modal). Revert PublicHeader auth (Account icon + menu); restore static Login/Sign Up only.
2. **Revert backend:** See `docs/PHASE1_PROMO_QR_DONE.md` for full rollback list (Prisma StorePromo, promosAuth, promosPublic, stores promos routes, server mount). Run a down-migration to drop `StorePromo` if needed.
3. **Routes:** Remove `/p/:promoId` and PromoScanRedeemLandingPage if reverting promo landing; remove dashboard promotions route if reverting the page.

---

## Tags (Generate tags) — sanity check

- **draftNormalize** merges `preview.items[].tags` into products (same pattern as description/imageUrl). Product cards should use the normalized catalog (e.g. `effectiveDraft.catalog.products` after refetch).
- **Refetch:** After successful MI PATCH (tags/rewrite/hero), Step 11 in StoreDraftReview calls `onRefresh()` once so the draft is refetched and the UI uses the updated state. If tags still don’t appear in the UI, confirm the parent that provides `baseDraft` to StoreDraftReview updates it with the refetched draft; no change to the MI orchestration spine.
