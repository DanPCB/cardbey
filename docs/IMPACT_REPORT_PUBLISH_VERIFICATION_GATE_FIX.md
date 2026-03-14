# Impact Report: Publish verification gate fix (frontend)

## Risk assessment (before code changes)

**Could this fix break store creation, auth, or publish workflow?**

- **Store creation:** No. We are not changing store creation flows, APIs, or routing. Only the condition that shows the verification modal and blocks the publish button is changed.
- **Auth:** No. We are not changing login, logout, /api/auth/me, or token handling. We are only changing how the frontend *uses* the already-returned `user` fields (`emailVerified`, `emailVerificationRequired`, `allowUnverifiedPublish`) for the publish gate.
- **Publish workflow:** Low risk. We are tightening the condition so the modal is shown only when the backend actually requires verification (`mustVerifyEmail`). If we mis-implement (e.g. never show the modal), unverified users could publish when they should not—mitigation: use the exact condition specified. If we leave the condition too loose, verified users could still see the modal—mitigation: use the three-field rule and ensure refreshed user state is used after "I've verified — Refresh".

**Conclusion:** Proceed with minimal, scoped changes. No changes to backend, store creation, or auth APIs.

---

## Root cause (identified)

1. **Wrong condition:** The frontend gates publish with `user.emailVerified === false` only. It does not use `emailVerificationRequired` or `allowUnverifiedPublish`. So the effective rule was "show modal when emailVerified is false", which is correct only when verification is required and not allowed to be bypassed. Using the three-field rule aligns with backend and avoids showing the modal when verification is not required or when already verified.

2. **Stale user after "Refresh":** `useCurrentUser()` memoizes `user` from `query.data.user` with a dependency array that included only `query.data?.user?.id` and `query.data?.user?.email`. After the user clicks "I've verified — Refresh", `refetch()` runs and the API returns `emailVerified: true`, but the memo did not recompute because `id` and `email` did not change. So the component kept the old `user` with `emailVerified: false`, and the subsequent retry of `handlePublish` still saw unverified and could show the modal again or block.

3. **Backend `result.needsEmailVerification`:** The publish API can return `needsEmailVerification: true`; that path still opens the modal. No change to that behavior; the fix ensures the *initial* gate and post-refresh state use the correct condition and fresh user.

---

## Condition before / after

**Before (StoreDraftReview):**
- `runOrPromptVerification`: `unverified = user && (user as { emailVerified?: boolean }).emailVerified === false`
- `handlePublish`: `if (user && (user as { emailVerified?: boolean }).emailVerified === false) { ... setVerificationModalOpen(true); return; }`
- `allowPublishAnyway`: `!!(user as { allowUnverifiedPublish?: boolean } | null)?.allowUnverifiedPublish`

**After:**
- Single derived value (useMemo):  
  `mustVerifyEmail = !!user && user.emailVerificationRequired === true && user.allowUnverifiedPublish !== true && user.emailVerified !== true`
- `runOrPromptVerification`: uses `mustVerifyEmail` instead of `unverified`.
- `handlePublish`: uses `mustVerifyEmail` instead of `user && ... emailVerified === false`; logs verification state and modal decision in DEV.
- `allowPublishAnyway`: unchanged (still from `user.allowUnverifiedPublish`).
- Modal is shown only when `mustVerifyEmail` is true (and when backend returns `result.needsEmailVerification`).
- `user` in `useCurrentUser` now depends on `emailVerified`, `emailVerificationRequired`, `allowUnverifiedPublish` so refetch updates the object and the next publish sees fresh state.

---

## Changed files

1. **`apps/dashboard/cardbey-marketing-dashboard/src/services/user.ts`**
   - Add `emailVerified`, `emailVerificationRequired`, and `allowUnverifiedPublish` to the `user` useMemo dependency array so that after `refetch()`, the returned `user` updates when verification state changes.

2. **`apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`**
   - Derive `mustVerifyEmail` from the three-field rule (with a small type cast for the extra fields).
   - Use `mustVerifyEmail` in `runOrPromptVerification` and in `handlePublish` instead of the previous `emailVerified === false` checks.
   - Add lightweight logs: verification state at publish gate, and (optional) when modal is shown/hidden.

3. **`apps/dashboard/cardbey-marketing-dashboard/src/components/verification/VerificationRequiredModal.tsx`**
   - In `handleRefresh`, add a lightweight log after refetch (e.g. "Refresh completed") so we can confirm the refresh path runs.

---

## Manual verification steps

1. **Verified user, fresh load**
   - Log in as a user that is already verified (`emailVerified: true` in DB).
   - Open a store draft review and click Publish.
   - Expect: no verification modal; publish proceeds (or fails only on other validation).

2. **Unverified user**
   - Log in as a user with `emailVerified: false`, `emailVerificationRequired: true`, `allowUnverifiedPublish: false`.
   - Click Publish.
   - Expect: verification modal appears. Click "I've verified — Refresh" after verifying in another tab.
   - Expect: refetch runs, modal closes, publish retry runs and succeeds (no modal again).

3. **Refresh updates state**
   - As unverified user, open modal, then verify email (e.g. click link in email).
   - Click "I've verified — Refresh".
   - Expect: modal closes and publish continues without showing the modal again (user object now has `emailVerified: true`).

4. **allowUnverifiedPublish (dev)**
   - With `CARD_BEY_ALLOW_UNVERIFIED_PUBLISH=true`, unverified user clicks Publish.
   - Expect: modal may show but "Publish anyway" is visible; clicking it allows publish without verifying.

5. **Logs (dev)**
   - In console, confirm logs for verification state at publish time and (if implemented) refresh completion.

---

## Summary

- **Root cause:** (1) Gate used only `emailVerified === false`; (2) `user` memo did not depend on `emailVerified` (and related fields), so post-refresh state stayed stale.
- **Fix:** Use `mustVerifyEmail` (three-field rule), show modal only when `mustVerifyEmail` is true, ensure "I've verified — Refresh" triggers a real refetch and that `user` memo updates so the next publish sees `emailVerified: true` and does not show the modal again. Minimal diffs; no refactors to unrelated auth or store flows.
