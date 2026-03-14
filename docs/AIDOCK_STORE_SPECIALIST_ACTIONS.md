# Store-Specialist Assistant — Actionable Store Guidance

## Summary

The store-specialist assistant on public store preview now performs **actionable store guidance**: intent buckets and quick actions are wired to concrete UI actions (scroll to catalog, scroll to promos) with conversational fallback when a target section is missing. No AIDock UI or assistant architecture changes; diff is minimal and additive.

---

## Impact assessment (LOCKED RULE)

- **Public store preview / catalog:** Only an optional callback and `data-store-section="promo"` added; no layout or data changes. Safe.
- **Frontscreen:** AIDock on frontscreen does not receive `onStoreAction`; when the callback is absent, it is not called. Safe.
- **Assistant open/close:** Unchanged. Safe.
- **Dashboard / mission / onboarding / publishing / promotion flows:** Not touched. Safe.

---

## Intent buckets → actions

| Intent bucket      | Store-surface action              | Reply behavior |
|--------------------|------------------------------------|----------------|
| `browse_products`  | `scroll_to_catalog`                | Scroll to menu/catalog; reply explains categories. |
| `promotions`       | `scroll_to_promos`                 | Scroll to promo banner if present; else reply only (graceful fallback). |
| `how_to_buy`       | `scroll_to_catalog`                | Scroll to menu; reply explains cart/Book and checkout. |
| `store_support`    | *(none)*                          | Conversational reply only. |
| `general_question` | *(none)*                          | Conversational reply only. |
| Escalated (platform/seller/mission/cross-store) | *(none)* | Global-style reply; no page action. |

---

## Action targets on store preview

- **scroll_to_catalog:** `catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })`. The ref is attached to the menu/catalog section (`id="menu"`, `data-store-section="menu"`) in all grid/list branches.
- **scroll_to_promos:** `document.querySelector('[data-store-section="promo"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })`. The promo banner wrapper has `data-store-section="promo"` in all three layout branches (mobile grid, desktop grid, list). If no promo banner is visible, the selector returns null and no scroll occurs; the reply already explains that the store may not have an active promotion.

---

## Files changed

| File | Change |
|------|--------|
| `src/lib/assistant/responseRouter.js` | Added `STORE_ACTIONS`; `getResponseForIntent` now returns optional `action` for store_specialist (`scroll_to_catalog`, `scroll_to_promos`) and updated reply copy for browse_products, promotions, how_to_buy. |
| `src/lib/assistant/index.js` | Export `STORE_ACTIONS`. |
| `src/components/assistant/AIDock.jsx` | New optional prop `onStoreAction(intentBucket, action)`; when store_specialist response has `action`, call `onStoreAction` then append reply. Dev log: action + usedCallback or fallback. |
| `src/pages/public/StorePreviewPage.tsx` | `handleStoreAction` callback: on `scroll_to_catalog` scroll `catalogRef`; on `scroll_to_promos` scroll `[data-store-section="promo"]` or no-op. Pass `onStoreAction={handleStoreAction}` to AIDock. Added `data-store-section="promo"` to all three promo banner wrappers. Dev log: intentBucket, action, target, found/used. |

---

## Dev logs

- **AIDock:** When an action is returned and mode is store_specialist: `[Assistant] Store action` with `intentBucket`, `action`, `usedCallback: true`; or `usedCallback: false` when `onStoreAction` is not provided (fallback).
- **StorePreviewPage:** `[StorePreview] action` with `intentBucket`, `action`, `target` ('catalog' | 'promos'), and for catalog `used: !!catalogRef.current`, for promos `found: true/false`, `fallback: true` when not found.

---

## Manual verification checklist

- [ ] **Store-specialist still opens/closes** – FAB and close button work on public store preview.
- [ ] **Browse products** – Quick action or message like "Browse products" or "View menu" scrolls to the catalog/menu section and shows the new reply. If catalog ref is not mounted (edge case), reply still appears; no crash.
- [ ] **Promotions** – "Offers" / "Promotions" scrolls to the promo banner when `?promo=...` is present and banner is visible; reply mentions "Taking you to current offers." When no promo banner is present, no scroll; reply explains store may not have an active promotion; dev log shows `found: false`, `fallback: true`.
- [ ] **How to buy** – "How to buy" / "Order" scrolls to the menu and reply explains cart/Book and checkout.
- [ ] **Store support** – Reply only; no scroll; no regression.
- [ ] **No regression** – Page rendering, category tabs, product grid/list, cart, navigation, and assistant routing (global vs store_specialist) behave as before. Frontscreen assistant unchanged (no onStoreAction).
