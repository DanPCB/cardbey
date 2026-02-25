# Root cause: "Sign in to continue" modal appears too soon

## What you see

The "Sign in to continue" modal appears **before** (or as soon as) the store preview is visible on the draft review page—so the correct behavior (modal only when the user clicks an action like Publish) seems to have disappeared.

## Root cause (no refactor)

The modal is opened **on page load** in this situation:

1. **User (guest) clicks Publish**  
   - Modal opens and a **pending ownership action** is stored (e.g. in `sessionStorage`: `cardbey.pendingOwnershipAction` with `type: 'publish'`), and optionally `cardbey.publishAfterAuth` for the legacy path.

2. **User signs in and is sent back to the draft page**  
   - They land on the same draft URL (e.g. via `returnTo`).

3. **"After login run pending publish" effect runs**  
   - In `StoreDraftReview.tsx` (lines 2237–2256), a `useEffect` runs when `user` is set.  
   - It reads `getPendingOwnershipAction()`. If it matches the current draft/store and is still within the 5‑minute window, it:
     - Clears the pending action
     - Calls `handlePublishRef.current?.()` → **`handlePublish()`**

4. **Publish runs and can open the modal again**  
   - `handlePublish()` calls the publish API.  
   - If the API returns **`needsLogin`** or the request throws **401** (e.g. session/cookie not yet propagated, or backend still treating the user as guest), the code does:
     - `useAuthPromptStore.getState().open({ force: true })`  
   - So the **same "Sign in to continue" modal** opens again, with `force: true`, even though the user just signed in.

5. **Result**  
   - The user sees the modal as soon as (or before) the preview is visible, so it feels like the modal “appears too soon” and the previous correct behavior (modal only on button click) has “disappeared.”

## Code paths that open the modal

- **On user action (intended):**  
  - `gatekeeper.requireAccount(...)` when a guest clicks Publish, Create QR Promo, Edit, etc.  
  - `runWithOwnershipGate` when a guest tries to run a gated action (e.g. publish).

- **On 401 / needsLogin (intended for retry):**  
  - In `handlePublish`: when `result.needsLogin` or when the publish request throws 401 / `AUTH_REQUIRED`, the code calls `useAuthPromptStore.getState().open({ force: true })` so the user can sign in and retry.

- **On load (unintended timing):**  
  - The **only** path that can open the modal without a new click is the combination above: the **after-login effect** runs on load, calls `handlePublish()`, and that call triggers **needsLogin or 401** → modal opens with `force: true`. So the modal appears “too soon” relative to the preview.

## Summary

- **Why the previous (correct) behavior seems to disappear:**  
  The modal is still shown on 401/needsLogin so the user can sign in and retry. When that happens **inside the “after login run pending publish” flow**, it runs as soon as the draft page loads and `user` is set, so the modal appears on load instead of only on a new button click.

- **Concrete cause:**  
  The **"after login run pending publish"** effect in `StoreDraftReview.tsx` (lines 2237–2256) runs when `user` is set and a matching pending action exists; it calls `handlePublish()`. If the publish API returns `needsLogin` or 401, the existing logic opens the auth modal with `force: true`, which produces the “modal appears too soon before preview store showing” behavior.

No code refactoring was done; this document only records the reason the modal can appear too soon (and why the previous modal behavior seems to have disappeared).
