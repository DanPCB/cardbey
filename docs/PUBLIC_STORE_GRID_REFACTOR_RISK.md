# Public Store Grid Refactor – Risk Report

**Goal:** Refactor PUBLIC store UI to reuse a canonical product grid/layout (Draft-style clean grid), one ProductCard + ProductGrid across Draft + Public, without breaking workflows.

---

## 1. What could break

| Area | Risk | Notes |
|------|------|--------|
| **Routing** | Low | No route changes. Public store remains `/preview/store/:storeId`, `/preview/:draftId`, `?view=public`. |
| **Auth gating** | Medium | StorePreviewPage uses `viewPublic`, `canEditThisStore`, `safeReturnTo`. Any branch that hides/shows edit vs public must stay correct. |
| **Store publish visibility** | High | Public view must show only published/visible products. Data source is `finalPreviewData` / `catalogPreviewData` from preview API; do not switch to draft-only APIs. |
| **Product fetching** | High | Public: `/api/store/:id/preview` → published preview. Draft: draft payload + menu items. Do not mix; add selector only if needed (e.g. filter by visibility when API returns both). |
| **Category filtering** | Medium | Public uses `selectedCategory` + `catalogPreviewData` (filtered items). Same logic must apply to new grid; URL query param is optional, add only if safe. |
| **Cart / Add-to-cart** | Medium | `handleAddToCart`, `usePublicCartStore`, ProductDetailsModal `onAddToCart` must stay wired. New grid must pass same handlers. |
| **Image loading** | Low | Use same `resolveImageUrl` / item image resolution; consistent container aspect ratio to avoid layout shift. |
| **Responsiveness** | Medium | New grid must match 1/2/3–4 columns (mobile/tablet/desktop). No regressions on small/large viewports. |
| **Analytics events** | Low | If any tracking on card click/add-to-cart, preserve in new components. |
| **Featured logic** | Low | Remove Featured badge in public only; do not change draft or internal use of “featured” if used elsewhere. |
| **Store creation / auth flows** | High | Do not change redirects, publish flow, or auth checks. No change to backend. |

---

## 2. Mitigations

- **Feature flag:** `PUBLIC_STORE_V2_GRID` (env `VITE_PUBLIC_STORE_V2_GRID=1` or API flag). When off, public store keeps current ImageFirstGrid + magazine layout. When on, use new ProductGrid + ProductCard (mode=public).
- **Data:** Do not change API calls. Public continues to use `finalPreviewData` / `catalogPreviewData`. If a selector is added (`selectPublicProducts`), it only filters already-fetched data (e.g. by visibility) and is used only when needed.
- **Canonical components:** One ProductGrid (layout + responsive columns), one ProductCard with `mode="public" | "draft"`. Public: no status pill, no edit actions, CTA = Add to cart. Draft: can keep ProductReviewCard for now (no mandatory draft migration in this refactor).
- **Minimal edits:** Prefer composition; avoid rewriting StorePreviewPage in one go. New components live under `components/store` or `components/preview` and are used only when flag is on.
- **No backend changes:** No new endpoints, no changes to auth or publish APIs.

---

## 3. Rollback plan

- **Instant rollback:** Set `VITE_PUBLIC_STORE_V2_GRID=0` (or unset) and rebuild, or disable API flag `PUBLIC_STORE_V2_GRID`. Public store reverts to current ImageFirstGrid + ProductCard (with Featured).
- **Code rollback:** Feature flag is checked at StorePreviewPage level; when off, existing branch runs. No deletion of old code until flag is proven in production.
- **No route-level toggle needed** beyond the flag; same URLs work for both layouts.

---

## 4. File map (Step 1 output)

| Purpose | File(s) | Action |
|---------|---------|--------|
| **Public store page** | `src/pages/public/StorePreviewPage.tsx` | When flag on: render new ProductGrid + ProductCard (public); keep category pills and cart wiring. |
| **Draft product card** | `src/features/storeDraft/review/ProductReviewCard.tsx` | No change in this refactor (draft keeps current card). Optional later: use canonical ProductCard mode=draft. |
| **Current public grid/card** | `src/components/preview/grid/ImageFirstGrid.tsx`, `ProductCard.tsx` | ProductCard: add `mode` prop; when mode=public, hide Featured. ImageFirstGrid: optional `hideFeaturedInPublic` or pass mode. |
| **Canonical components** | New or under `src/components/store/`: `ProductGrid.tsx`, `ProductCard.tsx` (or extend preview one), optional `CategoryPills.tsx` | Create ProductGrid (layout); extend or create ProductCard with mode=public\|draft. |
| **Feature flag** | `src/lib/featureFlags.ts` or env | Add `PUBLIC_STORE_V2_GRID` (env + optional API). |
| **Data/selectors** | `src/pages/public/StorePreviewPage.tsx` or small util | Only if needed: `selectPublicProducts(products)` for visibility filter; do not change fetch. |
| **Routes** | `src/App.jsx` | No change. |
| **ProductDetailsModal, cart** | Existing components | No change; keep passed to new grid/card. |

**Files to touch (minimal):**

1. `docs/PUBLIC_STORE_GRID_REFACTOR_RISK.md` (this file)
2. `src/lib/featureFlags.ts` – add flag getter
3. **New** `src/components/store/ProductCard.tsx` – canonical public card: vertical layout (image aspect 4:5 + text below), Add-to-cart with stopPropagation. Used only behind V2 flag.
4. **New** `src/components/store/ProductGrid.tsx` – responsive grid layout only
5. `src/pages/public/StorePreviewPage.tsx` – when flag on: `selectPublicProducts(catalogPreviewData.items)` then ProductGrid + store ProductCard; keep category pills, cart, ProductDetailsModal
6. `src/components/preview/grid/ProductCard.tsx` – **unchanged** (legacy overlay layout; ImageFirstGrid continues to use it)

**Public-safe filter:** `selectPublicProducts(items)` in StorePreviewPage filters by visibility/isPublished/status when present; when payload has no such fields, returns all (backend /api/store/:id/preview already returns published-only).

**Files not touched:** App.jsx, auth logic, API layer, StoreDraftReview, ProductReviewCard, backend.

---

## 5. References

- Development safety rule: `.cursor/rules/development-safety-rule.mdc`
- Existing feature flag pattern: `src/lib/featureFlags.ts` (`isCampaignsV2Enabled`, `isOrchestraV1Enabled`)

---

## 6. Step 1 output (PR description)

- Public view now enforces **selectPublicProducts()** at render time (prevents draft/hidden leakage). Visibility and status are compared case-insensitively; TODO for nested `item.product` if needed later.
- Public Store V2 uses new canonical **src/components/store/ProductCard.tsx** (vertical, 4:5 image + text below, no overlays).
- Legacy preview UI untouched (**src/components/preview/grid/ProductCard.tsx** unchanged).
- Add-to-cart does not trigger modal open (**preventDefault** + **stopPropagation** on click and **onPointerDown** for mobile Safari).
- Feature flag read once per mount (**useV2Grid** memo) so layout does not flicker if flags load async.
- Build passes.

---

## 7. Step 2 deliverable checklist (canonical component APIs)

- **src/components/store/ProductGrid.tsx** – `ProductGridProps`: `children`, `className?`, `columns?`, `gapClassName?`, `data-testid?`. Default layout: `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4`.
- **src/components/store/ProductCard.tsx** – `ProductCardMode`, `ProductCardPrice`, `ProductCardPrimaryAction`; `ProductCardProps`: `mode?`, `title`, `description?`, `imageUrl?`, `imageAlt?`, `imageAspectClassName?`, `price?`, `onOpen?`, `badgeSlot?`, `primaryAction?`, `secondaryActionSlot?`, `brandColor?`, `className?`, `data-testid?`. Vertical layout only; add_to_cart uses preventDefault + stopPropagation; badgeSlot only when `mode === 'draft'`.
- **src/components/store/CategoryPills.tsx** – `CategoryPill`, `CategoryPillsProps`: `value`, `onChange`, `categories`, `includeAll?`, `allLabel?`, `allId?`, `activeBackgroundColor?`, `className?`, `data-testid?`. Single-row, horizontally scrollable on mobile.
- **StorePreviewPage** V2 branch uses only these canonical components (ProductGrid with `data-testid="public-store-grid"`, ProductCard with `primaryAction: { kind: 'add_to_cart', ... }`, CategoryPills for category row when useV2Grid).

---

## 8b. Step 3 – Implementation summary (by file)

**StorePreviewPage:** useV2Grid = isMinimalPublicView && v2GridEnabled (memo); publicItems = useMemo(selectPublicProducts(catalogPreviewData?.items ?? [])); V2 branch maps publicItems, empty state "No products yet."; modal/cart unchanged.

**selectPublicProducts:** Dev-only console.debug when filtered count > 0.

**ProductGrid / ProductCard / CategoryPills / featureFlags:** Per Step 2; JIT-safe; stable flag default.

---

## 9. QA checklist (regression-focused)

Core: Public loads (?view=public + flag). Grid 2/3/4 cols. Product: card → modal; Add to cart → no modal, cart updates. Filtering: pills work. Data: no draft/hidden. Empty: 0 products → message. Performance: no shift/jank. Devices: Safari add-to-cart guard; desktop focus. Rollback: flag off.

---

## 10. Release checklist (safe rollout)

Flag default OFF in prod. Staging first; monitor errors/cart; gradual enable; single-switch rollback.

---

## 8. QA checklist (manual verification)

**Enable V2 grid:** Set `VITE_PUBLIC_STORE_V2_GRID=1` in `.env` or `.env.local`, or enable `PUBLIC_STORE_V2_GRID` via API flags. Then open a published store with `?view=public`.

- [ ] **Mobile Safari:** Public store loads; category pills (All + categories) work; product grid shows 2 columns; tap product opens Product Details modal; Add to cart works; cart drawer opens; no Featured badge on cards.
- [ ] **Desktop Chrome:** Same; grid shows 3–4 columns; click product opens modal; Add to cart and cart drawer work; no Featured badge.
- [ ] **Published store with 30+ products:** Grid scrolls; category filter narrows list; no layout shift or overflow.
- [ ] **Store with 0 products:** Grid is empty (no errors); category pills still show; header/hero visible.
- [ ] **Category edge cases:** Switch All → Category A → All; URL and scroll behavior unchanged; product ids still open correct item in modal.
- [ ] **Rollback:** Set `VITE_PUBLIC_STORE_V2_GRID=0` and rebuild; public store reverts to previous ImageFirstGrid/magazine layout.
- [ ] **Store creation / auth:** Create store flow, publish, and “store shows on frontscreen” unchanged (no regressions).
