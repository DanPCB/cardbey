# Store-Specialist Assistant — Contextual Result Cards and Store-Aware Guidance

## Summary

The store-specialist assistant now returns **contextual result content** and **store-aware guidance** inside AIDock: category chips for browse, promo-aware messages, and CTA-specific how-to-buy text. Section scrolling and fallbacks are unchanged. Implementation is additive and minimal.

---

## Impact assessment (LOCKED RULE)

- **Public store preview / catalog:** Only a new plain object `storeContextForAssistant` and one extra prop to AIDock; no layout or data changes. Safe.
- **Assistant open/close:** Unchanged. Safe.
- **Frontscreen:** Does not pass `storeContext`; replies stay global. Safe.
- **Dashboard / mission / onboarding / publishing / promotion:** Not touched. Safe.

---

## Context available to the assistant

The page passes a **storeContext** object into AIDock (store preview only):

| Field        | Source | Use |
|-------------|--------|-----|
| `categories` | `normalizedCats.map(c => c.label)` | Browse: show category list in reply + chips |
| `hasPromo`   | `!!(promoBanner && !promoBannerDismissed)` | Promotions: offer vs no-offer message |
| `promoTitle` | `promoBanner?.title` | Promotions: “Current offer: …” when present |
| `ctaType`    | `'book' \| 'cart' \| 'none'` from `isServiceStorePage` / `publicAddToCart` | How to buy: Book vs Add to cart guidance |

---

## Intent buckets → contextual behavior

| Intent | With context | Payload | Fallback |
|--------|----------------|--------|----------|
| **browse_products** | “This store has: Cat1, Cat2, … Scrolling to the menu…” | `{ categories }` → chips under reply | “Scrolling to the menu… Use the categories above to filter.” |
| **promotions** | hasPromo + promoTitle → “Current offer: ‘…’. Taking you there.”; hasPromo only → “This store has a current offer…” | — | “No active promotion right now. Check back later.” |
| **how_to_buy** | ctaType `book` → Book + reserve; `cart`/`both` → Add to cart + cart icon | — | Generic “Add to cart or Book…” |

Scroll actions (`scroll_to_catalog`, `scroll_to_promos`) are unchanged.

---

## Files changed

| File | Change |
|------|--------|
| `src/lib/assistant/responseRouter.js` | `getResponseForIntent` accepts optional `storeContext`. browse_products: categories in text + `payload: { categories }` when present; promotions: promo summary when hasPromo; how_to_buy: ctaType-based text. Dev logs: `contextual payload` / `contextual payload fallback` with intentBucket, reason. |
| `src/components/assistant/AIDock.jsx` | New prop `storeContext`. Pass to `getResponseForIntent`. Messages can have `payload`; render category chips below AI bubble when `payload.categories` exists. |
| `src/pages/public/StorePreviewPage.tsx` | Build `storeContextForAssistant` (plain object) before `assistantOverlay`; pass `storeContext={storeContextForAssistant}` to AIDock. |

---

## Dev logs

- **responseRouter:** `[Assistant] contextual payload` with `intentBucket`, `categories`/`hasPromo`/`ctaType`, `used: true` when context applied; `[Assistant] contextual payload fallback` with `reason` when fallback used.
- **AIDock:** (existing store-action logs unchanged.)

---

## Manual verification checklist

- [ ] **Assistant still opens/closes** – FAB and close button work on store preview.
- [ ] **Browse products** – With categories: reply lists category names and category chips appear below the message; scroll to catalog still runs. Without categories: generic reply, no chips, scroll still runs.
- [ ] **Promotions** – With active promo: reply mentions “Current offer” (and title if present); scroll to promos runs. Without promo: “No active promotion right now” (no scroll).
- [ ] **How to buy** – Service store: reply explains Book to reserve. Cart store: reply explains Add to cart + cart icon. Scroll to catalog still runs.
- [ ] **Missing data** – No categories / no promo / ctaType none: fallback replies only; no crash.
- [ ] **No regression** – Store preview rendering, category tabs, product grid, cart, and assistant routing unchanged. Frontscreen assistant unchanged.
