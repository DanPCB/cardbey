# Phase 1 Ship — Smoke Test Checklist

Use this after P0 fixes (StorePromo schema, returnTo preservation) to confirm the store creation spine and promo flow.

**Spine (unchanged):** Quick Create → Draft Review → Publish → Live. No changes to POST orchestra/start, GET temp/draft, PATCH draft-store, POST publish, GET store preview.

---

## 1) Quick Create → Draft Review → Publish → open storefrontUrl

1. Open the app (home or Create).
2. Use Quick Create (text): enter business name + type, submit.
3. Wait for navigation to Draft Review (URL like `/app/store/temp/review?mode=draft&jobId=...&generationRunId=...`).
4. Confirm draft loads (store name, products, hero/avatar when ready).
5. Optionally edit store name; save (PATCH should persist).
6. Click Publish (if guest, auth modal → login → claim then resume).
7. After success, note `storefrontUrl` (or click “View storefront”).
8. Open that URL in the same or new tab; confirm public store preview loads (GET /api/store/:id/preview).

**Pass:** Draft loads, publish returns URL, public store page shows the store.

---

## 2) Logged out → open Draft Review URL → login → return → Draft loads

1. Sign out (or use incognito).
2. Manually open a Draft Review URL that includes `jobId` and `generationRunId` (e.g. copy from a previous run or use a known-good URL from step 1).
   - Example: `/app/store/temp/review?mode=draft&jobId=clxxx&generationRunId=gen-xxx`
3. You should be redirected to `/login?returnTo=...` and `returnTo` must contain the full path + query (encoded).
4. Log in (or sign up).
5. After login, you must be navigated back to the **exact** Draft Review URL (same jobId + generationRunId).
6. Draft Review page loads and fetches the draft using that generationRunId (GET /api/stores/temp/draft?generationRunId=...).
7. Draft content appears (no blank, no 401 loop).

**Pass:** Redirect to login preserves full URL; after login, return to same URL and draft loads.

---

## 3) Create promo → open /p/:slug incognito → scan increments → QR download works

1. From a published store (or draft review with storeId), go to Promotions (e.g. Store Promotions page or link from review).
2. Create a promo: title, optional subtitle/hero/code; submit.
3. Note the promo slug (or “Copy link”); public URL is `/p/{slug}`.
4. Open `/p/{slug}` in an **incognito** window (no auth).
5. Confirm promo landing loads (or redirects to store with promo params); optionally confirm POST /api/public/promos/:slug/scan was called (scan count increments).
6. Back in the app, open “Download QR” (Packaging QR modal); download SVG and PNG.
7. Confirm files open and QR content is the promo URL.

**Pass:** Promo created, public landing works in incognito, scan increments, QR download works.

---

## Commands (optional)

```bash
# Core: ensure migrations and Prisma client
cd apps/core/cardbey-core
npx prisma migrate status
npx prisma generate
npm run test -- promos.routes.test.js
npm run test -- store-publish.test.js

# Dashboard: returnTo test
cd apps/dashboard/cardbey-marketing-dashboard
pnpm test -- tests/RequireAuthReturnTo.test.ts
pnpm test -- tests/reviewRoutes.test.ts
```

---

## Sign-off

- [ ] 1) Quick Create → Review → Publish → storefront
- [ ] 2) Logged-out draft review URL → login → return → draft loads
- [ ] 3) Promo create → /p/:slug incognito → scan → QR download

When all three pass, Phase 1 smoke is complete.
