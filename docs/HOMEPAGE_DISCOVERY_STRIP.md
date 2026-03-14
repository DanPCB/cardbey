# Homepage Discovery Strip — Marketplace-First Composition

## Summary

The Explore-based homepage (`/`) now includes a **homepage-only** discovery strip so the public home clearly feels like Cardbey’s marketplace/discovery entry point. The strip is shown only when `pathname === '/'`; `/frontscreen` is unchanged. Changes are minimal and additive.

---

## Impact assessment (LOCKED RULE)

- **`/` routing:** Unchanged; still renders `CardbeyFrontscreenTopNavPreview`. Safe.
- **Assistant:** Unchanged; bubble and explore behavior preserved. `mountPoint` is `'homepage'` when on `/`, `'frontscreen'` on `/frontscreen` for logs only. Safe.
- **`/frontscreen`:** No new content; `routerLocation.pathname === '/'` is false. Safe.
- **`/for-sellers`, `/create`, onboarding, dashboard, mission, publishing, promotion:** Not touched. Safe.

---

## Homepage composition change

When **pathname is `/`** (and only then), a **HomepageDiscoveryStrip** is rendered below the public header and above the existing header CTAs (Create with AI, Sign in). It includes:

- **Primary:** “What do you need?”
- **Helper:** “Discover local stores—swipe to browse food, products, and services.”
- **Secondary:** “Create your store” (link to `/create`) and “Tap 💬 for help.”

Styling: compact card (rounded, border, `bg-white/5`, `backdrop-blur`) so it fits the existing frontscreen look and stays discovery-first with seller CTA secondary.

---

## Files changed

| File | Change |
|------|--------|
| `pages/CardbeyFrontscreenTopNavPreview.jsx` | Added `HomepageDiscoveryStrip` component (heading, helper text, Create-your-store link, Tap 💬). Rendered only when `routerLocation.pathname === '/'`. AIDock `mountPoint` set to `routerLocation.pathname === '/' ? 'homepage' : 'frontscreen'`. |

---

## Manual verification checklist

- [ ] **`/`** – Discovery strip visible at top of content (“What do you need?”, “Discover local stores…”, “Create your store”, “Tap 💬 for help”). Reels and tabs behave as before.
- [ ] **`/frontscreen`** – No discovery strip; layout and behavior match previous frontscreen.
- [ ] **Assistant** – Opens/closes on `/` and `/frontscreen`; explore-style behavior unchanged.
- [ ] **Create** – “Create your store” in strip and “Create with AI” in header both go to seller flow; no regression.
- [ ] **`/for-sellers`, `/create`** – Unchanged.
- [ ] **No regressions** – Browsing, store preview, onboarding, dashboard, mission, publishing, promotion flows unchanged.
