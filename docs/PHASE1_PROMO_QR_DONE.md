# Phase 1 Promo + QR — DONE Report

## Risk assessment

- **Quick Create → Draft Review → Publish → Live:** No changes. All work is additive: new table, new routes, new dashboard page, new public route. No modification to automation spine, no new polling, no auth changes.
- **Reversible:** Yes. Rollback = revert file list below and run a down-migration for `StorePromo` if desired.

## File-by-file summary

| Area | File | Change | Why safe |
|------|------|--------|----------|
| Backend | `apps/core/cardbey-core/prisma/schema.prisma` | Added `StorePromo` model and `storePromos` relation on `Business`. | New table only; no change to existing models. |
| Backend | `apps/core/cardbey-core/src/routes/stores.js` | Added `ensureStoreOwner`, `GET /:storeId/promos`, `POST /:storeId/promos`. | New routes only; order placed so `/:storeId/promos` is matched before `/:id`. |
| Backend | `apps/core/cardbey-core/src/routes/promos.js` | **New.** Public `GET /:promoId` returning safe fields; 404 if promo/store missing. | Read-only; no auth; no change to existing flows. |
| Backend | `apps/core/cardbey-core/src/server.js` | Import and mount `promosRoutes` at `/api/promos`. | Additive mount only. |
| Dashboard | `apps/dashboard/cardbey-marketing-dashboard/src/api/storePromos.ts` | **New.** Client for list/create promos and public fetch; `getPromoLandingUrl`, `getPromoQRImageUrl`, `downloadPromoQR`. | New API module only. |
| Dashboard | `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/PromoScanRedeemLandingPage.tsx` | **New.** Public page for `/p/:promoId`: store name/logo, title, description, redeem instructions, “View store” link. | New page; no auth; 404 when promo missing. |
| Dashboard | `apps/dashboard/cardbey-marketing-dashboard/src/pages/dashboard/StorePromotionsPage.tsx` | **New.** Create form (title, description, code), list promos, QR preview, “Download PNG”. | Auth via existing `RequireAuth`; only uses new store promos API. |
| Dashboard | `apps/dashboard/cardbey-marketing-dashboard/src/App.jsx` | Import `PromoScanRedeemLandingPage`, `StorePromotionsPage`; route `/p/promo/:publicId` (first), then `/p/:promoId`, then `/dashboard/stores/:storeId/promotions`. | New routes only; more specific `/p/promo/:publicId` before `/p/:promoId`. |
| Core tests | `apps/core/cardbey-core/tests/promos.routes.test.js` | **New.** POST promos requires auth; public GET returns safe fields; GET 404 when missing. | Tests new behavior only. |

## Test commands

**Backend (core):**  
Requires DB with `StorePromo` table (run migration first).

```bash
cd apps/core/cardbey-core
npx prisma migrate dev --name add_store_promo   # if migrations are healthy
# OR apply StorePromo table manually if shadow DB has issues
npm test -- tests/promos.routes.test.js
```

**Expected:**  
- `POST /api/stores/:storeId/promos` without auth → 401.  
- `GET /api/promos/:promoId` with existing promo → 200 and safe fields.  
- `GET /api/promos/:promoId` with bad id → 404.

## Manual checklist

1. **Create store → Publish**  
   Quick Create → Draft Review → Publish → confirm store is live (unchanged).

2. **Create promo in dashboard**  
   - Go to `/dashboard/stores/{storeId}/promotions` (replace `{storeId}` with a real store id).  
   - Create promo: title e.g. “10% off”, description optional, code e.g. “SAVE10”.  
   - After create: landing URL and QR preview appear; click “Download PNG” and confirm file.

3. **Open QR URL in incognito**  
   - Copy landing URL (e.g. `https://your-origin/p/{promoId}`).  
   - Open in incognito; promo page loads with store name, title, description, redeem instructions.  
   - No auth required.

4. **Promo page → store**  
   - On promo landing, click “View store”; should go to public store feed for that store.

5. **Provider off / 404**  
   - Open `/p/nonexistent-id`; expect “Promo not found” (or 404).  
   - No crash.

## Rollback list (files to revert)

- `apps/core/cardbey-core/prisma/schema.prisma` (remove `StorePromo` and `storePromos` on `Business`)
- `apps/core/cardbey-core/src/routes/stores.js` (remove `ensureStoreOwner`, `GET /:storeId/promos`, `POST /:storeId/promos`)
- `apps/core/cardbey-core/src/routes/promos.js` (delete file)
- `apps/core/cardbey-core/src/server.js` (remove `promosRoutes` import and `app.use('/api/promos', ...)`)
- `apps/dashboard/cardbey-marketing-dashboard/src/api/storePromos.ts` (delete)
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/PromoScanRedeemLandingPage.tsx` (delete)
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/dashboard/StorePromotionsPage.tsx` (delete)
- `apps/dashboard/cardbey-marketing-dashboard/src/App.jsx` (remove new imports and the three new routes)
- `apps/core/cardbey-core/tests/promos.routes.test.js` (delete)

Then run a Prisma migration to drop `StorePromo` if the table was created.
