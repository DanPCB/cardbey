# Create QR Promo – Implementation Summary

## What was missing

- The **Create QR Promo** quick-action (QR icon in Draft Store builder and on Promotions page) opened a modal that used the **legacy promo flow** (POST `/api/promos`, landing at `/p/:slug`) and did not use the existing **Dynamic QR** system (`/q/:code` with scan tracking).
- No wizard for **target** (storefront / product / category), **CTA**, or **offer** text.
- No support for **draft-only** stores (no “preview QR” or clear gating).
- No **promo card** image (store name, CTA, QR, offer) for download.
- **Scan tracking**: `/q/:code` and resolve already existed; UTM params were not appended to redirect URLs.

## How it works now

1. **Click “Create QR Promo”**  
   Opens the **Create QR Promo** modal (wizard). Auth is still gated by existing `gatekeeper.requireAccount()`.

2. **Wizard**
   - **Step 1 – Target:** Storefront (default), Product, or Category; product/category chosen from dropdowns.
   - **Step 2 – Message:** CTA text (default: “Scan to view our store”, max 50), optional offer text (max 60).
   - **Step 3 – Generate:** “Generate QR” (published store) or “Generate preview QR” (draft).

3. **Published store**
   - Calls **POST /api/qr/create** with `storeId`, `type: 'storefront'`, and `targetPath` (path built from store/product/category).
   - Backend creates a **DynamicQr** row and returns `code` and `url` (`/q/:code`).
   - QR encodes the absolute URL to `/q/:code`. Scan → dashboard loads `/q/:publicCode` (PrintBagLandingPage) → **GET /api/qr/:code/resolve** → backend records **ScanEvent** and returns `redirectUrl` (with UTM) → client redirects.

4. **Draft-only store**
   - Banner: “Publish to generate a public QR. You can still generate a private preview QR.”
   - “Generate preview QR” builds a QR client-side for the current draft URL (e.g. `window.location.href`). No backend persist; no scan tracking.

5. **Outputs**
   - **Copy link** (absolute `/q/:code` or preview URL).
   - **QR image:** SVG (from `qrcode.react`) and PNG (via api.qrserver.com).
   - **Promo card PNG:** 1080×1080 image with optional store name, CTA, QR, and offer (client-side canvas).

6. **Persistence**
   - Published: **DynamicQr** in DB; **GET /api/qr?storeId=** lists QR promos for the store (for future “QR Promos” list).

7. **Tracking**
   - **GET /api/qr/:code/resolve** records a **ScanEvent** (dynamicQrId, storeId, userAgent, referer) and returns `redirectUrl` with **UTM** appended: `utm_source=qr&utm_medium=print&utm_campaign=<code>`.

## Files changed

### Backend (cardbey-core)

- **`src/routes/qr.js`**
  - **GET /api/qr?storeId=** – list Dynamic QR records for store (auth, store owner).
  - **appendUtmParams()** – append UTM to `redirectUrl` in resolve response.

### Frontend (dashboard)

- **`src/lib/nextRoute.ts`**
  - **buildQrRedirectPath(storeId, targetType, targetId?)** – single source of truth for QR target path (storefront/product/category with query params).

- **`src/api/dynamicQr.ts`**
  - **listDynamicQr(storeId)** – GET /api/qr?storeId=.
  - **DynamicQrItem** type.

- **`src/features/storeDraft/components/CreateQRPromoModal.tsx`**
  - Reimplemented as wizard: Target → Message → Generate.
  - Uses **createDynamicQr** for published store; **buildQrRedirectPath** for targetPath.
  - Draft: banner + “Generate preview QR” (client-side QR, no persist).
  - Result: Copy link, Download SVG, Download PNG, **Download promo card (PNG)** (canvas: store name, CTA, QR, offer).
  - New optional props: **categoryOptions**, **isDraftOnly**, **draftPreviewUrl**, **storeName**, **brandColor**.

- **`src/features/storeDraft/StoreDraftReview.tsx`**
  - Passes **categoryOptions**, **isDraftOnly**, **draftPreviewUrl**, **storeName** into CreateQRPromoModal.

- **`src/pages/dashboard/StorePromotionsPage.tsx`**
  - No change to modal props; **onCreated** still used (signature now `(code, url) => void`).

### Tests

- **`tests/qrRedirectPath.test.ts`** – unit tests for **buildQrRedirectPath** (storefront, product, category, encoding).
- **`tests/e2e/store-draft-review.spec.ts`** – e2e: open Create QR Promo modal, run wizard, assert “Copy link” / “Download SVG” / “Download PNG” after generate.

## Manual test steps

1. **Draft store only → preview QR**
   - Open draft review (e.g. `/app/store/temp/review?mode=draft&jobId=...`).
   - Click **Create QR Promo** (e.g. from More menu).
   - Confirm banner: “Publish to generate a public QR. You can still generate a private preview QR.”
   - Choose Target → Message → **Generate preview QR**.
   - Confirm: QR preview, Copy link, Download SVG, Download PNG, Download promo card (PNG).

2. **Published store → public QR**
   - Use a store with a real `storeId` (not temp).
   - Open Create QR Promo, complete wizard, click **Generate QR**.
   - Confirm: link is `https://<origin>/q/<code>`, downloads work.
   - In “More” → “Promos” (or future “QR Promos”) the new QR can be listed via GET /api/qr?storeId=.

3. **Scan QR → redirect and scan count**
   - Scan the printed/saved QR (or open `/q/<code>` in browser).
   - Confirm redirect to storefront (or product/category URL) with UTM params.
   - Confirm **ScanEvent** is created (e.g. in DB or via scan-count in a future list UI).

## Risk / minimal change

- **Store Creation → Draft → Publish** is unchanged: no changes to create/draft/publish routes or to the legacy `/api/promos` or `/p/:slug` flow.
- Create QR Promo is additive: new wizard and Dynamic QR path; existing promo list and Packaging QR modal unchanged.
- **PrintBagLandingPage** already falls back to **GET /api/qr/:code/resolve** when SmartObject landing fails; resolve now returns UTM-appended `redirectUrl`.
