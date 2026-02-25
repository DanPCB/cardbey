# Guest guard trace – why it wasn’t firing and what could break

## 1) What “guest” means at runtime

- **Tokens**: `getTokens()` reads `localStorage` (e.g. `cardbey_*_bearer`). Quick start / guest flow stores a **guest JWT** in `localStorage.bearer` (see `quickStart.ts`: `window.localStorage.setItem(storageKeys.bearer, guestResponse.token)`). So in guest mode, **bearer is often present**.
- **User**: `useCurrentUser()` calls `/api/auth/me`. For guest JWTs the backend returns `user: { id, role: 'guest' }` (see `apps/core/cardbey-core/src/routes/auth.js`). It does **not** set `user.isGuest`.
- **Previous isGuest**: Logic was `!getTokens()?.bearer || !user || user.isGuest === true`. So when:
  - Bearer exists (guest token), and
  - Query has run and returned `{ id, role: 'guest' }`,
  we never set `user.isGuest`, so `user.isGuest === true` is false → **isGuest was false** and the guard did not run.
- **Auth store**: `useAuthPromptStore` only opens when `openAuthModal()` is called; no other flags define “guest” there.

**Conclusion:** Treat as guest when `user?.role === 'guest'` (and optionally when no bearer or no user). Primary fix: **isGuest = no valid bearer OR no user OR user.isGuest === true OR user.role === 'guest'.**

---

## 2) Click paths – does the handler hit the gatekeeper before any API?

| Action | Handler / entry | Reaches gatekeeper before API? |
|--------|------------------|---------------------------------|
| **Publish** | `handlePublish` → `runWithOwnershipGate(..., runWithAuth(...))` → `gatekeeper.gate()` then API. | **Yes.** But if `isGuest` was wrong (see above), gate allowed and API ran. |
| **Edit store name** | Hero `onEditName` → `runOrPromptVerification(handleEditName)` → `handleEditName` (prompt). | **No.** Only email verification is checked; no gatekeeper. |
| **Edit logo / hero** | `onEditLogo` / `onEditHero` → `runOrPromptVerification(handleEditLogo/HandleEditHero)` → open branding modal. | **No.** Same as name. |
| **Product card click** | Card `onClick` → inline `setSelectedProductId(product.id); setDrawerMode('edit'); setIsDrawerOpen(true)`. | **No.** No gatekeeper; drawer opens and edits allowed. |
| **Generate tags** | **MICommandBar**: chip click → `onBeforeMIAction?.()` then `startOrchestraTask` / `runOrchestraJob`. **ImproveDropdown**: “Generate tags” → `handleMIAction('generate_tags', …)` → `startOrchestraTask` (no `onBeforeMIAction`). | **MICommandBar:** Optional gate exists (`onBeforeMIAction`) but **StoreDraftReview did not pass a guest gate**. **ImproveDropdown:** **No** gate; API runs immediately. |

So the guard “not firing” was due to (1) **isGuest** being false for token-based guests with `role: 'guest'`, and (2) several actions (**edit name/logo/hero**, **product card click**, **Improve “Generate tags”**) never running through a central account gate before doing anything.

---

## 3) What could break if we change gating

| Risk | Mitigation |
|------|------------|
| **returnTo loops** | Never set `returnTo` to `/login` or `/signup`. Use existing `getSafeReturnTo` on login redirect; in header, when path is `/login`/`/signup`, use a safe default (e.g. `/dashboard`). |
| **Draft preview access** | Keep draft preview page **viewable** in guest mode (no modal on load). Gate only **actions** (click to edit, publish, MI, etc.), not the initial render or read-only view. |
| **Publish flow** | Gate only adds an early “if guest → open modal; return”. Authenticated users still go through `runWithAuth` and existing publish flow; no change to payload or success path. |
| **Token hydration** | Use **bearer as primary**: no bearer ⇒ guest. After `/api/auth/me`, also treat `user.role === 'guest'` as guest so guest tokens are consistently gated even before/if we add `isGuest` on the user object. |

---

## 4) Implementation (minimal, safe)

- **Gatekeeper:** Fix `isGuest` (include `user?.role === 'guest'`), add `getReturnTo()`, `requireAccount(onAllowed)`, and optional `requireAI(featureKey, onAllowed)` (Gate #2). Temporary debug log: `gatekeeper` with `bearer`, `user`, `isGuest`.
- **StoreDraftReview:** Wrap all “next actions” with `requireAccount`: Publish, edit name/logo/hero/categories, review products, generate promotions, product card click (open edit drawer), Add product, hero/avatar upload, repair, MI actions. Pass `onBeforeMIAction` to **MICommandBar** and **ImproveDropdown** that runs `requireAccount` (if guest, open modal and return false).
- **ImproveDropdown:** Add optional `onBeforeMIAction?: () => boolean`; at start of `handleMIAction`, if provided and returns false, return without starting job.
- **Pricing:** Implement “Skip / Continue Free” with safe `returnTo` (read from query, validate with `getSafeReturnTo`); navigate back without granting AI.

No change to RequireAuth or route-level access for the draft preview URL; no automatic modal on load.
