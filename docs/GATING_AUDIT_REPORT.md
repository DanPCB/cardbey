# Gating Audit Report (no refactor)

## 1. useGatekeeper.ts

| Item | Current behavior |
|------|------------------|
| **isGuest** | `!tokens?.bearer \|\| !user \|\| user.isGuest === true \|\| user.role === 'guest'` — correct: guest = no token OR no user OR guest flag/role. |
| **requireAccount(onAllowed)** | If `isGuest` → `openAuthModal()`, return; else `onAllowed()`. No context check (applies everywhere). |
| **requireAI(featureKey, onAllowed)** | If `isGuest` → `openAuthModal()`, return; else if `!hasAIEntitlement` → `navigate(/pricing?intent=ai&feature=...&returnTo=...)`, return; else `onAllowed()`. No post-draft-only check. |
| **getReturnTo()** | `pathname + search + hash`. Good. |
| **gate(action, requirePremium)** | Async: `hasAuth && !isGuest` (and optionally `isPremium`). Returns `{ allowed, reason }`. |
| **Context** | No `isPostDraftContext()` — gating runs on any page. So if Create/QuickStart ever called `requireAccount` before Generate, it would block; currently they do not. |

---

## 2. StoreDraftReview.tsx

| Area | Current gating |
|------|----------------|
| **runWithAuth** | Uses `gatekeeper.gate()` then runs fn; on 401 opens auth modal. |
| **requireAuth** | Sync: if `gatekeeper.isGuest` → openAuthModal throw; if `requirePremium && !gatekeeper.isPremium` → openAuthModal throw. |
| **runWithOwnershipGate** | From `useOwnershipGate`: if **`user`** (truthy) → run fn; else set pending + open ownership modal. **Bug:** uses `user` not realUser — guest with bearer has `user` so can pass. |
| **Post-draft actions** | Wrapped with `gatekeeper.requireAccount(runOrPromptVerification(...))`: edit logo/hero/name/categories, review products, generate promotions, create QR promo, publish, generate/paste/upload/clear hero, add product, product details/edit/promotion/MI/campaign/add image/tags/category/set hero/rename, save. |
| **Add category** | One path uses `runOrPromptVerification(handleAddCategory)` only (no requireAccount) — possible gap. |
| **canPublish** | `draftReadyForPublish && !gatekeeper.isGuest`. Good. |
| **Publish button** | If guest && draftReady → "Sign in to publish" (openAuthModal); else handlePublish. Good. |
| **MICommandBar** | `onBeforeMIAction`: if `gatekeeper.isGuest` → openAuthModal return false; if `!gatekeeper.hasAIEntitlement` → navigate pricing return false; else true. Gate 2 logic inline. |
| **ImproveDropdown** | Same `onBeforeMIAction`. `onPowerFix`: `gatekeeper.requireAccount(() => { ... })`. |
| **SoftAuthPrompt** | Uses `gatekeeper.isGuest`, `getReturnTo`; no modal on load. |

---

## 3. Create / QuickStart

| Item | Current behavior |
|------|------------------|
| **CreatePage handleGenerate** | Calls `quickStartCreateJob(navigate, payload)` with **no** requireAccount/openAuthModal before it. Generate is **not** gated. |
| **useAiEligibility (CreatePage)** | `isGuest = isError \|\| data == null` (billing balance). Used for copy ("Log in to use AI credits") and UnlockAiModal. Not `user.role === 'guest'`. |
| **UnlockAiModal onUpgrade** | If `isGuest` → `authPromptOpen({ returnTo: '/pricing' })`; else `navigate('/pricing')`. |
| **quickStart.ts ensureAuth()** | Runs before orchestra/start; gets or creates **guest** session so draft creation has a token. No Gate 1 on the flow. |

---

## 4. MICommandBar / ImproveDropdown

| Item | Current behavior |
|------|------------------|
| **MICommandBar** | Receives `onBeforeMIAction` from StoreDraftReview. Returns false if guest (open modal) or no AI entitlement (navigate pricing). Chips call it before starting; no `requireAI` wrapper. |
| **ImproveDropdown** | Same `onBeforeMIAction`; `onPowerFix` wrapped in `gatekeeper.requireAccount(...)`. |

---

## 5. Header (auth icon)

| Item | Current behavior |
|------|------------------|
| **PublicHeader** | `realAuthed = isRealAuthed(tokens, user, authLoading)` (from authSession). Account icon when `realAuthed`; else Login / Sign up. Correct. |

---

## What could break if we change gating scope

| Change | Risk |
|--------|------|
| **Gate 1 only in “post-draft” context** | Create/QuickStart has no Gate 1 today; adding `isPostDraftContext()` so Gate 1 runs only there is safe and keeps Generate unblocked. Any future call to requireAccount on /create would still not block if we explicitly skip when !isPostDraftContext(). |
| **Guest token / user.role === 'guest'** | useOwnershipGate currently uses `if (user)` so guest with bearer + user object passes and can run publish. Changing to realUser (user && user.role !== 'guest') will correctly gate guest: open modal, set pending, resume after login. No unintended break for real users. |
| **returnTo** | Auth modal and CTAs already use gatekeeper.getReturnTo() or store returnTo. Standardizing on current URL (pathname + search + hash) is already the pattern; hardcoded returnTo elsewhere could send users to wrong place — audit those separately. |
| **Publish** | runWithOwnershipGate + runWithAuth: today guest can pass first gate (ownership) if `user` exists. Fixing ownership to realUser only affects guests; after login, claim + publish still runs. Session flag `cardbey.publishAfterAuth` and pending ownership action remain. |
| **AI actions (Gate 2)** | Moving to centralized `requireAI(featureKey, fn)` from inline onBeforeMIAction keeps behavior (guest → modal, no entitlement → pricing). If we ever run requireAI only when isPostDraftContext(), Create stays unblocked since MI chips live on draft review only. |

---

## Summary

- **Create/QuickStart:** No Gate 1 on Generate; ensureAuth provides guest token. Safe to keep and to add an explicit “no Gate 1 when !isPostDraftContext()” if desired.
- **Draft review:** Many actions already behind requireAccount; publish behind runWithOwnershipGate + runWithAuth. **Fix:** runWithOwnershipGate should use realUser so guest is gated.
- **AI (MICommandBar / ImproveDropdown):** Gate 2 logic is inline (guest → modal, no entitlement → pricing). Can be centralized in requireAI without changing behavior.
- **Header:** Already uses realAuthed; no change needed for “account icon only for real users.”

---

## Files changed (minimal implementation)

| File | Change |
|------|--------|
| **useGatekeeper.ts** | Added Gating Map comment; `isPostDraftContext()` (path /app/store/…/review or /preview/…review); `isGuestSession`, `isRealAuthed`, `isPostDraftContext` exposed. `requireAccount` / `requireAI` only gate when `isPostDraftContext` is true (Create/QuickStart never gated). |
| **useOwnershipGate.ts** | Uses `isRealAuthed(tokens, user, isLoading)` instead of `user`; guest (role === 'guest') now opens modal and sets pending. returnTo includes hash. |
| **StoreDraftReview.tsx** | MICommandBar/ImproveDropdown `onBeforeMIAction` use `gatekeeper.isGuestSession`. canPublish and “Sign in to publish” use `isGuestSession` / `isRealAuthed`. Add-category button and Add key/click use `gatekeeper.requireAccount(...)`. |
| **CreatePage** | No change. Generate still calls `quickStartCreateJob` with no requireAccount (Create remains unblocked). |
| **PublicHeader** | No change. Already uses `isRealAuthed` from authSession for account icon. |

---

## Confirmation

- **Create unblocked:** Gate 1 runs only when `isPostDraftContext()` is true. Create/QuickStart do not call requireAccount; Generate works for guest.
- **Post-draft gated:** On draft review, requireAccount and requireAI run; guest sees auth modal on “next actions”; runWithOwnershipGate now gates guest (realUser only runs publish).
- **AI → pricing:** In post-draft context, requireAI and onBeforeMIAction send realUser without AI entitlement to `/pricing?intent=ai&feature=...&returnTo=...`.
