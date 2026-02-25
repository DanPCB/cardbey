# Step 3: QA + Release checklist (Public Store V2 Grid)

Append or reference from `PUBLIC_STORE_GRID_REFACTOR_RISK.md`.

---

## Step 3 – Implementation summary (by file)

**StorePreviewPage:** `useV2Grid` = isMinimalPublicView && v2GridEnabled (memo). `publicItems` = useMemo(selectPublicProducts(catalogPreviewData?.items ?? [])). V2 branch: CategoryPills + ProductGrid; map publicItems → ProductCard (onOpen, primaryAction add_to_cart); empty state "No products yet." when publicItems.length === 0. Modal/cart wiring unchanged. No route/API changes; legacy when !useV2Grid.

**selectPublicProducts:** Filter visibility hidden, isPublished false, status draft (case-insensitive). Dev-only console.debug when filtered count > 0.

**ProductGrid / ProductCard / CategoryPills / featureFlags:** Per Step 2 contracts; JIT-safe; stable flag default (false when flags load async).

---

## QA checklist (regression-focused)

- **Core:** Public view loads with ?view=public and V2 flag on. Grid renders (2/3/4 cols), scrolls smoothly.
- **Product:** Tap/click card → ProductDetailsModal for correct product. Tap Add to cart → adds item, does NOT open modal; cart drawer updates.
- **Filtering:** CategoryPills All → Category → All; selected state persists; no console errors.
- **Data safety:** Public never shows status=draft, visibility=hidden, isPublished=false.
- **Empty state:** 0 products → "No products yet."; no crash.
- **Performance:** 30+ products → no layout shift, no jank on modal open/close.
- **Devices:** Mobile Safari – add-to-cart doesn’t trigger modal; category scroll. Desktop – hover/focus, no focus trap.
- **Rollback:** Flag off → old layout after rebuild.

---

## Release checklist (safe rollout)

- **Flag default OFF** in prod (VITE_PUBLIC_STORE_V2_GRID=0).
- **Staging first:** Turn ON, run QA; test store with 30+ and 0 items.
- **Monitor:** StorePreviewPage/ProductDetailsModal errors; cart regressions; "no products" reports.
- **Gradual:** Enable for small % or own stores first.
- **Rollback:** Single switch (API flag or env + redeploy); no route change.
