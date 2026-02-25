# Guest → Sign up → Publish flow

This doc describes the path: **create a store as guest → sign up (business account) → return to draft → publish live**, and what was fixed so nothing gets stuck.

## Flow summary

1. **Guest** creates a store (Create / Quick Start) and lands on draft review (`/app/store/temp/review?jobId=...&generationRunId=...`).
2. Guest clicks **"Sign in to publish"** (or any gated action) → **Auth modal** opens (Sign in / Sign up).
3. **Sign up** → `cardbey.draft.pendingReturn` is set to the current draft URL, then user goes to **/signup**.
4. After **successful signup** → **Signup success** page → **"Log in now"** → `/login` (with `returnTo` from pendingReturn when set).
5. After **login** → **LoginPage** uses `getPostLoginTarget()`: prefers `cardbey.draft.pendingReturn` → redirect to **draft review**.
6. User clicks **Publish** → If email not verified, **Verification modal** appears; user can **"Send verification email"**, **"I've verified — Refresh"**, or **"Publish anyway (verify later)"**.
7. **Publish** → POST `/api/store/publish` (backend allows; guest-created drafts are allowed for the now-logged-in user via `isDraftOwnedByUser`).

## Fixes applied (so nothing gets stuck)

| Area | Fix |
|------|-----|
| **Auth modal "Sign up"** | Now goes to **/signup** (not /login). `cardbey.draft.pendingReturn` is already set before navigate. |
| **Promo modal "Create account"** | Sets `cardbey.draft.pendingReturn` before `navigate('/signup')` so after signup → login user returns to draft. |
| **Signup success "Log in now"** | If `cardbey.draft.pendingReturn` exists and is &lt; 10 min old, navigates to `/login?returnTo=<draft URL>`. |
| **LoginPage** | After login (and after token login), uses `getPostLoginTarget()` so redirect goes to draft when pendingReturn is set. |
| **Backend GET /api/stores/temp/draft** | Guest-created drafts are accessible after login (`isDraftOwnedByUser` allows when task owner is `guest_*`). |
| **Backend publish** | Same ownership rule: guest-created draft can be published by the now-authenticated user. |
| **Verification modal** | **"Publish anyway (verify later)"** added so user can complete publish without verifying email; backend does not block. |

## Env / behaviour that can still block

- **ENABLE_EMAIL_VERIFICATION** (Core): When `true`, **POST /api/draft-store/:draftId/commit** (signup-and-commit path) returns 403 until email is verified. **POST /api/store/publish** does *not* check email verification, so "Publish anyway" always works for the main publish flow.
- **PUBLISH_REQUIRES_AUTH** (Core): When `true`, commit endpoint requires auth; the flow above uses login/signup so auth is satisfied before publish.

## Quick test checklist

1. Open app as guest (or in incognito), go to Create → build a store → land on draft review.
2. Click **"Sign in to publish"** → modal → **Sign up** → complete signup → **Log in now** → login.
3. Confirm redirect back to **draft review** (same jobId/generationRunId).
4. Click **Publish** → if verification modal appears, use **"Publish anyway (verify later)"** or verify and refresh.
5. Confirm store publishes and you get success overlay + redirect to live store.
