# Public Store V2: Subgrouping + Breadcrumb – Risk Note & Rollback

## 1. What could break

| Area | Risk | Mitigation |
|------|------|------------|
| **Routing / query params** | None | No route or query changes. `selectedCategory` remains React state only. |
| **Category pills state** | Low | Same `selectedCategory` / `setSelectedCategory`; only rendering and breadcrumb label change. Pills still control filter. |
| **Public-safe filtering** | Low | `selectPublicProducts` still applied first. Grouping runs on `publicItems` only. No new data source. |
| **ProductDetailsModal / openProductDetails(id)** | Low | Same `openProductDetails(id)` per card; id still `menu-${originalIdx}`. No change to modal wiring. |
| **Add-to-cart (stopPropagation)** | None | Same `handleAddToCart` and `primaryAction`; no change to ProductCard handlers. |
| **Cart drawer / FAB** | None | Not touched. Per-card button and floating FAB remain. |
| **Responsive grid** | Low | Same ProductGrid/ProductCard; only wrapped in sections when "All". Section headers are static Tailwind. |
| **Feature flag gating** | None | All new logic lives inside existing `useV2Grid` branches. Flag OFF → no subgrouping, no new breadcrumb. |

## 2. Rollback plan

- **Instant rollback:** Set `VITE_PUBLIC_STORE_V2_GRID=0` (or disable API flag `PUBLIC_STORE_V2_GRID`) and rebuild. Public store reverts to current flat grid and previous breadcrumb (Store › All · Category pills).
- **Code rollback:** Revert only `StorePreviewPage.tsx` changes; no API, routes, or shared components change.
- **No route change** → same URLs; rollback is a single flag/config switch.

## 3. Scope of code changes

- **Single file:** `src/pages/public/StorePreviewPage.tsx`.
- **Add:** Helpers `getCategoryLabel`, `groupItemsByCategory` (and `Group` type).
- **Change (V2 only):** Breadcrumb row label to "Products" / "Products · {CategoryLabel}".
- **Change (V2 only):** When `selectedCategory === 'all'`: render sections (SectionHeader + ProductGrid per group). When category selected: single ProductGrid (unchanged behavior).
- **Unchanged:** selectPublicProducts, modal/cart, CategoryPills, ProductGrid/ProductCard contracts, feature flag check.

---

## 4. Grouping key

- **Normalized key:** `(item.category ?? '').trim().toLowerCase()` — avoids duplicates like "Bouquets " vs "bouquets".
- **Source-of-truth:** Map from `finalPreviewData.categories`: normalized key → display label. If item's normalized key not in map → "Other".
- **Section label:** Uses display label from categories list (not raw item string) when key exists in map; "Other" for uncategorized.

---

## 5. Breadcrumb

- **V2 branch:** Single breadcrumb row above CategoryPills: "Products" when All, "Products · {CategoryLabel}" when category selected. Derived UI only (no routes/query). No performer/draft chain ("All > Categories > …").
- **Placement:** Under store name → (1) Breadcrumb row (text-sm muted), (2) CategoryPills row, (3) content (grouped sections or single grid). Always visible in V2; not conditionally hidden by All or group rendering.
- **Risk (re-adding breadcrumb):** V2 rendering order (mobile/desktop), subgroup sections, selectedCategory + CategoryPills, ProductDetailsModal, add-to-cart stopPropagation, and flag gating are unchanged—breadcrumb is display-only. **Rollback:** `PUBLIC_STORE_V2_GRID` OFF → public uses legacy layout; no route/query change.

---

## 5b. Categories visibility (public store requirement)

- **Requirement:** Public store must always show category navigation (no "dumped list"). CategoryPills row is primary; subgroup section headers when All.
- **Risk (enforcing visibility):** UI-only behind `useV2Grid`. Sticky header, selectedCategory, v2Groups, modal, add-to-cart, responsiveness/FAB unchanged. No admin controls in public (edit tips, "Group by", readiness badges are draft/review only). **Rollback:** Disable `PUBLIC_STORE_V2_GRID`.
- **Dev warning:** When >60% of items fall in "Other", console.warn so merchants can add categories.

---

## 5c. Public breadcrumb visibility (keep on public page)

- **Spec:** Public V2 only. When All: hide breadcrumb (reduce clutter). When category selected: show breadcrumb = "{CategoryLabel}" only (no "Products" prefix). Breadcrumb above CategoryPills; display-only; no "All > Categories > Entrees" chain.
- **Risk:** Display-only; no route/query/API. View detection, flag, subgroup sections, CategoryPills, modal/cart unchanged. **Rollback:** `PUBLIC_STORE_V2_GRID` off or revert the breadcrumb UI block.

---

## 5d. Category pills always visible (public store)

- **Requirement:** In public storefront when useV2Grid, CategoryPills MUST always render (even when selectedCategory is All or categories are empty/malformed). At least "All" pill must show.
- **Risk:** UI-only; no change to useV2Grid, selectedCategory, v2Groups, modal/cart. **Rollback:** Disable `PUBLIC_STORE_V2_GRID` or revert pill/list derivation.

---

## 5e. Categories as objects (categoryId grouping)

- **Fix:** finalPreviewData.categories may be object[] (e.g. { id, name }) not string[]; items may have categoryId. Normalize categories to PublicCategory[] (id + label); grouping uses getItemCategoryId (categoryId first, then category string match). Pills and filter use normalized list. No API changes. **Rollback:** Disable `PUBLIC_STORE_V2_GRID`.

---

## 6. QA confirmation checklist

| Check | Pass/Fail | Notes |
|-------|-----------|--------|
| Public V2, All: multiple sections with headers | Manual | Sections follow category order; "Other" last. |
| Public V2, All: items under correct headers | Manual | By normalized `item.category`; display label from categories. |
| Item with unknown category appears under "Other" | Manual | Normalized key not in categories map → Other. |
| Public V2, select category: breadcrumb "Products · X", single grid | Manual | No multi-section wall. |
| Category with 0 items shows empty state (no crash) | Manual | "No products yet."; no error. |
| Card click opens correct modal | Manual | Same `openProductDetails(id)`. |
| Add-to-cart does not open modal | Manual | Unchanged handler. |
| Cart drawer / FAB | Manual | Unchanged. |
| Mobile: sections + FAB no overlap | Manual | Spacing mt-6 / mb-3. |
| Flag OFF: old layout unchanged | Manual | No V2 code runs. |

---

## 7. Rollback confirmation

**Disable `PUBLIC_STORE_V2_GRID` (env or API) → public store reverts to current flat grid and previous breadcrumb.** No route or API change; single switch.
