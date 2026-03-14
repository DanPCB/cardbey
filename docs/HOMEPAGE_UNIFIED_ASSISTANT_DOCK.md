# Homepage Unified Assistant Dock

## Summary

On the homepage (`/`), Cardbey now uses **one persistent assistant dock** as the main interaction gateway. The discovery strip and the separate "Create with AI" CTA have been removed from the page chrome; their roles are absorbed into the assistant, which is **open by default** on `/`. Non-home pages keep existing assistant behavior (closed by default; store-specialist unchanged on store preview).

---

## Impact assessment (LOCKED RULE)

- **`/` routing:** Unchanged; still `CardbeyFrontscreenTopNavPreview`. Safe.
- **Assistant architecture:** `hasHomepage` added to resolved context; homepage content returned from `getAssistantContent` when `hasHomepage`. No change to store_specialist or global routing. Safe.
- **Assistant open/close on non-home:** On `/frontscreen` and elsewhere, dock remains closed by default; sync effect only sets open when `isHomepage`. Safe.
- **`/frontscreen`:** No discovery strip; CTAs (Create with AI, Sign in) still shown. Dock closed by default. Safe.
- **`/for-sellers`, `/create`, onboarding, dashboard, mission, publishing, promotion, store preview/store-specialist:** Not touched. Safe.

---

## Homepage elements removed / unified

| Before | After |
|--------|--------|
| **HomepageDiscoveryStrip** ("What do you need?", discovery copy, Create link) | Removed. Messaging moved into assistant greeting + starters + seller block. |
| **FrontscreenHeaderCTAs** on `/` (Create with AI, Sign in) | Hidden on `/` only. Shown on `/frontscreen`. |
| **Floating assistant** (closed by default) | On `/`, dock **open by default**; same floating 💬 button toggles close/reopen. |

---

## Homepage assistant behavior

- **Visible by default** on `/` (initial state + effect sync with `isHomepage`).
- **Greeting:** "What do you need? Discover local stores or start your own."
- **Starters:** "Find products or services", "What's trending?", "Ask for help", "Create your store".
- **Seller block:** When `sellerHelper` is set (homepage content), a block shows helper copy and a "Create your store" button that navigates to `/create`. Tapping the "Create your store" starter chip also navigates to `/create` (via `onNavigateToCreate`).
- **Free text:** Unchanged; intent bucketing and replies work as before for discovery and seller intents.

---

## Files changed

| File | Change |
|------|--------|
| `lib/assistant/assistantRouter.js` | `resolveAssistantContext`: compute `hasHomepage = pathname === '/'`; add `hasHomepage` to return. |
| `lib/assistant/assistantTypes.js` | `ResolvedAssistantContext`: add optional `hasHomepage`. |
| `lib/assistant/assistantStarters.js` | `getHomepageAssistantContent()`: greeting, starters (incl. "Create your store"), `sellerHelper`. `getAssistantContent`: when `resolved.hasHomepage`, return homepage content. |
| `components/assistant/AIDock.jsx` | State `sellerHelper` from content. Prop `onNavigateToCreate`. When starter "Create your store" and `onNavigateToCreate`, call it. Render seller block (helper text + "Create your store" button) when `sellerHelper` and `onNavigateToCreate`. |
| `pages/CardbeyFrontscreenTopNavPreview.jsx` | Remove `HomepageDiscoveryStrip` component and its render. `FrontscreenHeaderCTAs`: accept `pathname`, return `null` when `pathname === '/'`. `aiOpen` initial state from `routerLocation.pathname === '/'`; effect `setAiOpen(isHomepage)` on pathname change. Pass `onNavigateToCreate={isHomepage ? () => navigate('/create') : undefined}` to AIDock. Add `useNavigate`, `isHomepage`. Dev log: include `isHomepage`, `dockOpenByDefault`. |

---

## Manual verification checklist

- [ ] **On `/`, one main assistant gateway** – No discovery strip; no "Create with AI" in header; dock is the primary entry.
- [ ] **Discovery strip removed** – Not rendered on `/`.
- [ ] **Homepage floating "Create with AI" removed** – Header CTAs hidden on `/`.
- [ ] **Assistant visible by default on `/`** – Dock opens on load; user can close with ✕ or 💬 and reopen with 💬.
- [ ] **Buyer/general starters** – "Find products or services", "What's trending?", "Ask for help" present and work.
- [ ] **Seller CTA and helper** – "Create your store" chip and seller block with helper text + "Create your store" button; both navigate to `/create`.
- [ ] **Free text input** – Still works for discovery and seller questions.
- [ ] **Non-home assistant** – On `/frontscreen`, dock closed by default; CTAs visible; opening assistant works.
- [ ] **`/frontscreen`** – No strip; behavior unchanged aside from dock closed by default.
- [ ] **Store preview / store-specialist** – Unchanged.
- [ ] **No regressions** – Navigation, onboarding, dashboard, mission, publishing, promotion flows intact.
