# Home scroll-to-hero navigation – risk assessment

**Purpose:** Before implementing “Home” nav scroll-to-hero behavior, document where logic lives, risks, and mitigations. This behavior was attempted before and rolled back; avoid scroll loops and breaking Create.

---

## 1. Where things live

| Concern | Location |
|--------|----------|
| **Nav items (order, labels, paths)** | `apps/dashboard/cardbey-marketing-dashboard/src/components/layout/PublicHeader.tsx` — `navLinks` array; desktop and mobile both map over it. |
| **Hash-scroll behavior** | `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/Homepage.tsx` — single `useEffect` that runs when `location.hash` is `#create` or `#features`; bounded retry (rAF + `MAX_SCROLL_RETRIES`), cleanup on unmount. |
| **Create click behavior** | `PublicHeader.tsx` — `handleCreateClick`: on home `preventDefault` + `scrollToCreate()`; elsewhere `navigate('/#create')`. |
| **Hero section** | `Homepage.tsx` — `<section id="hero">` (parallax uses `getElementById('hero')`); must keep `id="hero"` for parallax. |

---

## 2. Risks

- **Scroll loops:** If hash-scroll runs on every render or re-triggers itself (e.g. scroll changes hash, hash triggers scroll), can cause repeated scroll or navigation. **Mitigation:** Run scroll effect only when `location.hash === '#home'` or `#create` (and `#features` normalize once). Bounded retry (rAF + max attempts), no setInterval. Cleanup on unmount. Do not write hash from scroll logic.
- **Hash normalization causing repeated navigation:** If we do `navigate('/#home', { replace: true })` and the effect depends on `location.hash`, ensure we only normalize once (e.g. only when hash is `#top`), then scroll; do not re-navigate in a loop. **Mitigation:** Optional normalize `#top` → `#home` once; then scroll in same or next effect run; no repeated replace.
- **Breaking existing Create behavior:** Create uses `/#create`, scroll to `#create`, active when `pathname === '/' && hash === '#create'`. **Mitigation:** Do not change Create link target, handler, or active logic; only add Home handling in parallel.
- **Breaking active nav highlighting:** Home should be active when `pathname === '/' && (hash === '' \|\| hash === '#home')`; Create when `pathname === '/' && hash === '#create'`. **Mitigation:** Extend `isActive` for Home to treat `#home` and empty hash as “at hero”; keep Create rule unchanged.
- **Mobile menu mismatch:** Desktop and mobile both use `navLinks` and the same click handlers. **Mitigation:** Add `isHome` (or similar) to nav config and use one handler for Home in both render paths (same pattern as Create).

---

## 3. Mitigations (implementation discipline)

- **Bounded retry:** requestAnimationFrame + max attempts (e.g. 3–5); stop when element found and scrolled.
- **Cleanup on unmount:** cancel rAF, clear any pending timeouts, set cancelled flag.
- **No setInterval:** Do not use setInterval for scroll or hash logic.
- **No backend changes:** All changes are frontend-only (Homepage, PublicHeader).
- **Stable hero anchor:** Add a wrapper `<section id="home">` around existing `<section id="hero">` so scroll target is `#home`; parallax continues to use `#hero`.

---

## 4. References

- Create hash-scroll and rollback context: `docs/FEATURES_LOOP_ROOT_CAUSE.md`, `docs/FEATURES_20S_LOOP_FIX_PLAN.md`.
- Development safety rule: `.cursor/rules/development-safety-rule.mdc`.
