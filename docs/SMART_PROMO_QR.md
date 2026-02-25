# Smart Promo + QR (packaging)

One shippable feature: create a promo for a store (optional product), get a stable short link `/p/:slug`, QR for packaging, and a public landing page with optional scan tracking.

## How to use

1. **Create a promo (dashboard)**  
   Go to **Dashboard → Store → Promotions** (or `/dashboard/stores/:storeId/promotions`).  
   - Pick the store (page is store-scoped).  
   - Enter **Title** (required), optional **Subtitle**, **Hero image URL**, **Coupon code**.  
   - Click **Create promo**.

2. **Public link & QR**  
   After create you get:  
   - **Stable short link**: `https://your-origin/p/:slug` (e.g. `/p/abc12xyz`).  
   - **Copy link** to clipboard.  
   - **QR code preview** (same URL).  
   - **Download SVG** – recommended for print (scales without quality loss).  
   - **Download PNG** – for screens or quick use.

3. **Printing**  
   Prefer **Download SVG** for packaging/print so the QR scales cleanly. Use PNG for digital only if needed.

4. **Public landing**  
   When someone opens the link (or scans the QR):  
   - They see store name, hero (if set), title, subtitle, description, coupon code (if set).  
   - One **CTA button** (default “View offer”) goes to the store (or product) and adds `?coupon=...` if a coupon code is set.  
   - Scan is counted once per day per browser (localStorage throttle).

## Endpoints

- **Auth:**  
  - `POST /api/promos` – create (body: storeId, title, subtitle?, heroImageUrl?, ctaLabel?, targetUrl?, couponCode?, …).  
  - `GET /api/promos?storeId=` – list promos for store.  
  - `PATCH /api/promos/:id` – update promo (store owner).
- **Public:**  
  - `GET /api/public/promos/:slug` – get promo by slug (safe fields only).  
  - `POST /api/public/promos/:slug/scan` – increment scan count (throttle in UI).

## Manual verification checklist

1. Create store → Publish (unchanged).
2. Go to `/dashboard/stores/{storeId}/promotions`.
3. Create promo: title “Test offer”, optional subtitle/hero/code → Create.
4. Confirm short link appears (e.g. `/p/xxxxxxxx`), click **Copy link** and paste elsewhere to verify.
5. Click **Download SVG** → open file, confirm it’s a valid SVG with QR.
6. Click **Download PNG** → confirm PNG downloads.
7. Open the promo link in an **incognito** window → landing shows title/CTA.
8. Click CTA → should go to store (or product) and, if coupon was set, URL includes `?coupon=...`.
9. In same incognito session, reload once; scan count should increment once per day (optional: check in DB or future analytics).

## Rollback

Revert (in order): dashboard StorePromotionsPage + API client + PromoScanRedeemLandingPage; App route `/p/:slug`; core routes `promosAuth.js`, `promosPublic.js`, server mounts; schema + migration for `StorePromo` (new columns/slug). Keep store creation pipeline untouched.
