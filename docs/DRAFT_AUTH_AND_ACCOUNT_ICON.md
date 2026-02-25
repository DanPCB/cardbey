# Draft workflow: auth modal and account icon

This doc describes how auth and the account icon work in the store draft flow so changes don’t regress behavior.

## 1. Account icon (signed-in only)

**Single component:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/components/DraftAccountIcon.tsx`

- Renders **only when** `gatekeeper.isRealAuthed` (bearer + user loaded + `user.role !== 'guest'`).
- Shows icon + dropdown (name, email, My Stores, Dashboard, Account, Credits & Billing, Sign out).
- Used in:
  - **Draft preview top bar** (StoreDraftReview – main logo bar)
  - **Publish-review header** (“Published Store” + View Public Storefront + Edit Draft)
  - **Publish success overlay** (after “Store published!” – top bar with logo + account icon)

**Do not:** Show the account icon when the user is a guest. Do not duplicate the dropdown UI; use `DraftAccountIcon` everywhere in the draft flow.

## 2. Auth modal (“Sign in to continue” / “Save your store”)

**Never show when the user has a bearer token, unless the server returned 401 (then show so user can re-auth).**

- **`stores/authPromptStore.ts`**  
  In `open()`, if `getTokens().bearer` is present and `force` is not true: do **not** set `isOpen: true`; set `isOpen: false` and return. When `force: true` (e.g. after 401 or needsLogin), open the modal anyway so the user can sign in again.

- **`features/auth/useGatekeeper.ts`**  
  In `openAuthModal(force?)`: if `getTokens().bearer` is present and `force` is not true, call `close()` and return. When `force === true`, open the modal regardless (used when the API returned 401).

- **When to use `force: true`:** In any handler for 401 or `needsLogin` from the server (e.g. publish, runWithAuth catch). That way the “Sign in to continue” / “Save your store” modal appears even when the client still has an expired/invalid token in storage.

**Do not:** Open the auth modal without checking for an existing bearer token in the normal (non-401) path. Do use `force: true` when the server has returned 401 or needsLogin.

## 3. Token-at-call-time checks (avoid modal after login)

These ensure that right after sign-in (or when the profile is still loading), we don’t open the modal or block the action just because React state is stale.

- **`useGatekeeper.requireAccount(onAllowed)`**  
  At call time, if `getTokens().bearer` is present → run `onAllowed()` and return. Otherwise, in post-draft context and if `isGuestSession`, open modal.

- **`useOwnershipGate.runWithOwnershipGate(options, fn)`**  
  At call time, if `getTokens().bearer` is present → run `fn()` and return. Otherwise use existing `realAuthed` logic (and open ownership modal if guest).

- **`StoreDraftReview.handlePublish`**  
  At start: if `getTokens().bearer` is present, do **not** open the auth modal; continue (e.g. run publish or let API return 401).

- **`useGatekeeper.gate()`**  
  Only blocks when there is **no** auth token. If a token exists, it allows the action (backend can return 401 if invalid).

**Do not:** Rely only on `isGuest` / `isGuestSession` / `realAuthed` from hook state when deciding to open the modal or block an action; re-check `getTokens().bearer` at the time of the action where it matters.

## 4. Gate 1 on draft view (soft guard)

When the **draft view page is already loaded**, the following actions apply **Gate 1** and open the sign-in/sign-up modal if the user is a guest (soft guard — modal only on click, not on page load):

- **Publish Store** — `requireAccount(handleGoToPublishReview)` before going to publish step.
- **Create QR Promo** (More menu and product cards) — `requireAccount(() => setCreateQRPromoModalOpen(true))` or `requireAccount` around promo creation.
- **Create smart object / promotion** — Same Gate 1 via `requireAccount` or `onBeforeMIAction` where those flows are triggered.

**Publish to live** (readonly publish step): uses `handlePublish`, which (A) opens the auth modal if guest (Gate 1), and (B) **requests email verification** by opening the verification modal when the user is signed in but `emailVerified === false`.

## 5. Where the auth modal can be triggered (and how it’s guarded)

- **requireAccount** (e.g. Create QR Promo, MI actions): token check at call time + store/openAuthModal guards.
- **runWithAuth** (gate failure or 401 from inner fn): gate allows when token exists; 401 path opens modal but store/openAuthModal guards prevent show when token present.
- **handlePublish** (guest click): token check at start; then runWithOwnershipGate (token at call time); then publish API `needsLogin` or catch 401/open – again guarded by store.
- **Direct openAuthModal() or authPromptStore.open()**: guarded by store and openAuthModal().

## 6. Checklist for changes

When touching draft auth or account UI:

- [ ] Account icon only when signed in: use `DraftAccountIcon` (which uses `isRealAuthed`); don’t show for guests.
- [ ] Auth modal never when bearer exists: keep guards in `authPromptStore.open()` and `openAuthModal()`.
- [ ] New gated actions: use token-at-call-time (e.g. `getTokens().bearer`) before opening the modal or blocking.
- [ ] New “account icon” placement in draft/success flow: use `<DraftAccountIcon />`; don’t reimplement the dropdown.
