# Impact: Undo recovery – guest gating + Prisma publish

## What the Undo reverted (identified)

### Frontend – guest gating broken

| File | Reverted behavior | Current (broken) |
|------|-------------------|------------------|
| **useGatekeeper.ts** | `openAuthModal()` called `useAuthPromptStore.getState().open({ returnTo: pathname+search+hash })` so AuthRequiredModal opened with returnTo. | Now dispatches `cardbey:openAuthModal` event; **no listener** calls authPromptStore.open(), so modal never opens from draft/publish. |
| **AuthRequiredModal.tsx** | Sign in → `/login?mode=signin&returnTo=...`; Sign up → `/login?mode=signup&returnTo=...`; fallback included hash; two buttons (Sign in, Sign up). | Sign in → `/login?returnTo=...` (no mode); Sign up → `/signup?returnTo=...`; fallback no hash; ownership shows one primary CTA. |
| **PublicHeader.tsx** | Login/Sign Up links used `loginTo` / `signupTo` with encoded current path+search+hash and guard when on /login. | Hardcoded `to="/login"` and `to="/signup"` – no returnTo. |

### Backend – Prisma error

- **publishDraftService.js** calls `prisma.business.update({ data: { ..., heroImageUrl, avatarImageUrl } })`.
- **Business** model in `prisma/schema.prisma` has **no** `heroImageUrl` or `avatarImageUrl` (only StorePromo has heroImageUrl; Business has stylePreferences Json).
- Result: `Unknown argument heroImageUrl in prisma.business.update()`.

## Flows now broken

1. **Guest clicks Publish / edit / save:** gatekeeper.openAuthModal() runs but only fires an event; AuthRequiredModal never opens, so guest is not sent to /login; mutations can be attempted.
2. **Header “Login” / “Sign Up”:** no returnTo, so after login user may land on wrong page; Sign Up goes to /signup instead of single /login with mode.
3. **Publish (authenticated):** business.update() fails with Prisma error, so publish never completes.

## What might break if we change

| Risk | Mitigation |
|------|------------|
| returnTo loops | Auth modal and LoginPage use getSafeReturnTo (reject /login, /signup). Header guard: when path is /login, use returnTo=/dashboard. |
| Draft view access | RequireAuth already allows mode=draft for guests; no change. |
| Publish flow | Restore gating so guest never calls publish API; fix Prisma payload so update only uses existing (or newly added) schema fields. |
| Prisma schema | Add only heroImageUrl + avatarImageUrl to Business; migration is additive. |

## Prisma fix path chosen

**Option 2 (add fields + migrate):** Product and publish flow already expect Business to have heroImageUrl and avatarImageUrl (publicStoreMapper, stores routes, tests). Schema never had them. Adding both to Business and migrating is the minimal, consistent fix.

## Field names (final)

- **Schema (Business):** `heroImageUrl String?`, `avatarImageUrl String?`, `publishedAt DateTime?`
- **Backend (publishDraftService):** update payload uses `heroImageUrl`, `avatarImageUrl`, `publishedAt`; keys whitelisted via `BUSINESS_UPDATE_KEYS`.
- **Frontend:** no change; already sends preview/draft with profileHeroUrl/profileAvatarUrl; backend maps to heroImageUrl/avatarImageUrl for Business.

---

## Deliverable (changes applied)

### Files changed

| File | Why |
|------|-----|
| **useGatekeeper.ts** | `openAuthModal()` now calls `useAuthPromptStore.getState().open({ returnTo })` with pathname+search+hash so the auth modal opens when guests try protected actions. |
| **AuthRequiredModal.tsx** | Fallback returnTo includes hash; Sign in → `/login?mode=signin&returnTo=...`; Sign up → `/login?mode=signup&returnTo=...`; two CTAs (Sign in, Sign up); optional `cardbey.draft.pendingReturn` before navigate. |
| **authPromptStore.ts** | Default `returnTo` in `open()` now includes `window.location.hash`. |
| **PublicHeader.tsx** | Login/Sign Up links use `loginTo` and `signupTo` with `mode=signin|signup` and encoded returnTo (pathname+search+hash); when path is `/login` or `/signup`, returnTo set to `/dashboard`. |
| **prisma/schema.prisma** | Added to Business: `heroImageUrl String?`, `avatarImageUrl String?`, `publishedAt DateTime?`. |
| **publishDraftService.js** | Build `businessData` from whitelist `BUSINESS_UPDATE_KEYS`; removed top-level `publishedAt` from initial fix then restored it after aligning schema with existing migration; hero/avatar/publishedAt passed through whitelist. |

### Prisma fix path

**Option 2 (add fields + use existing migration):** Schema now includes `heroImageUrl`, `avatarImageUrl`, and `publishedAt` on Business. Migration `20260208120000_add_business_hero_avatar_published` already adds these columns; no new migration created. If your DB is behind, run `pnpm prisma migrate deploy` in `apps/core/cardbey-core`.

### Hero/avatar/published field names

- **Schema:** `Business.heroImageUrl`, `Business.avatarImageUrl`, `Business.publishedAt`
- **Backend:** Same names in `prisma.business.update()` data (whitelist ensures only these + other allowed keys are sent).
- **Frontend:** Unchanged; backend derives hero/avatar from draft preview meta and profile fields.
