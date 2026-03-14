# Homepage → Explore/Frontscreen Routing

## Summary

The Cardbey homepage (`/`) now uses the **Explore/frontscreen** experience (demand-first). The previous seller-first hero landing page is **preserved at `/for-sellers`**. Create remains at `/create` (seller/store creation flow). Routing and layout changes are minimal and additive.

---

## Impact assessment (LOCKED RULE)

- **Explore/frontscreen:** Same component (`CardbeyFrontscreenTopNavPreview`) now serves both `/` and `/frontscreen`; behavior unchanged. Safe.
- **Assistant:** Path `/` is treated as page type `explore` so greeting/starters match; bubble open/close unchanged. Safe.
- **Store preview/public catalog, onboarding, dashboard, mission, publishing, promotion:** Not touched. Safe.
- **Navigation:** Home = `/` (now frontscreen); Create = `/create` (unchanged). Safe.

---

## Route mapping (before → after)

| Path | Before | After |
|------|--------|--------|
| `/` | Homepage (seller hero) | **CardbeyFrontscreenTopNavPreview** (Explore/frontscreen) |
| `/frontscreen` | CardbeyFrontscreenTopNavPreview | Unchanged |
| `/for-sellers` | (did not exist) | **Homepage** (seller-first hero, ex-homepage) |
| `/create` | CreatePage | Unchanged |
| `/features` | Redirect to `/#create` | Redirect to **/for-sellers#create** |

---

## Files changed

| File | Change |
|------|--------|
| `App.jsx` | Route `/` → `CardbeyFrontscreenTopNavPreview`. New route `/for-sellers` → `Homepage`. `isFrontscreen` includes `pathname === "/"`. `isPublicPage` includes `/for-sellers`. `/features` → `<Navigate to="/for-sellers#create" />`. |
| `pages/public/Homepage.tsx` | Scroll-to-create uses current pathname: `navigate(\`${location.pathname}#create\`, { replace: true })` so it works at `/for-sellers`. |
| `lib/assistant/assistantContext.js` | `getPageTypeFromPathname`: `/` and `''` return `'explore'` (was `'home'`) so assistant on `/` uses explore-style content. |

---

## Where the old homepage lives

- **URL:** `/for-sellers`
- **Component:** `Homepage` (unchanged; Apple-inspired seller hero, “Million Dollar Business Idea”, Create section, etc.)
- **Deep link to create section:** `/for-sellers#create`
- **Backward compat:** `/features` redirects to `/for-sellers#create`.

---

## Manual verification checklist

- [ ] **`/` shows Explore/frontscreen** – Store reels, tabs, top nav, and feed behavior match current `/frontscreen`.
- [ ] **Assistant on `/`** – Bubble opens/closes (💬, Alt+/); greeting and starters are explore-style.
- [ ] **Navigation** – “Home” (if present) goes to `/`; “Create” goes to `/create`; no broken links.
- [ ] **Create flow** – `/create` still shows CreatePage (AI prompt, Generate, Quick Start options).
- [ ] **Old hero** – `/for-sellers` shows the previous seller-first homepage; scroll-to-create and CTAs work; `/for-sellers#create` scrolls to create section.
- [ ] **/features** – Redirects to `/for-sellers#create`.
- [ ] **No regressions** – Public browsing, store preview, onboarding, dashboard, mission, publishing, promotion flows unchanged. Auth buttons, language switch, and top nav work on `/` and `/frontscreen`.
