# Impact Report: Your Businesses + My Stores Fix

## Summary

- **Ownership mechanism used:** `Business.userId` (1:1 User ↔ Business). No membership table.
- **API for "Your Businesses":** GET `/api/auth/me` returns `user` with `stores: user.business ? [user.business] : []` (backend uses `include: { business: true }`).
- **DB fields:** `Business.userId` (required, unique) — ownership/visibility = businesses where `userId === currentUser.id`.

## What Could Break (and mitigations)

| Risk | Why | Mitigation |
|------|-----|------------|
| **Publish flow (guest)** | Guest can no longer publish in any environment; they get 401 AUTH_REQUIRED. | Required by product: "Do NOT attach stores to guest accounts." Guests must sign in/sign up before publish. |
| **Guest → real claim** | Existing stores already linked to a guest user are not auto-transferred to the real user after login. | Out of scope for this change. Those users can re-publish after login (new Business with their userId), or a future "claim" endpoint can transfer `Business.userId` from guest to real user. |
| **List filters** | No change to list filters; auth/me and GET /api/stores both use `Business.userId === req.userId`. | N/A. |

## Smallest Safe Patch Applied

1. **Backend – publishDraftService.js**  
   - When `userId` is a guest id (`guest_*`), always throw `PublishDraftError('AUTH_REQUIRED', ...)` in all environments.  
   - Removed the dev-only path that created a guest User and linked the new Business to that guest.  
   - **Fields written on publish (unchanged):** New Business is created with `userId: publishUserId` (real user id only now), `name`, `type`, `slug`, `description`, `isActive`, etc. No new fields; ownership is set at create time.

2. **Frontend – Account page**  
   - `handleOpenStore(storeId)` now navigates to `/app/store/${storeId}/review` (store management) instead of `/dashboard`.  
   - Store cards show avatar/logo (`store.avatarImageUrl` or `store.logo`) or fallback `Building2` icon.

3. **Frontend – PublicHeader**  
   - Uses `stores` from `useCurrentUser()` (same source as Account page).  
   - When `stores.length > 0`, dropdown shows a "My Stores" section (up to 5 stores) with avatar + name, each linking to `/app/store/${store.id}/review`.

4. **Cache invalidation**  
   - After publish success in `StoreDraftReview.tsx`, added `queryClient.invalidateQueries({ queryKey: ['currentUser'] })` so Account and header "My Stores" update without full reload.

## Exact Fields Written on Publish

- **New Business (temp store):** `userId`, `name`, `type`, `slug`, `description`, `isActive: false` (then updated in same flow to `isActive: true`, `publishedAt`, `logo`, `heroImageUrl`, `avatarImageUrl`, `stylePreferences`, etc.).  
- **Ownership:** Set once at create: `Business.userId = publishUserId` (real user id; guest path removed).

## UI Changes

- **Account page:** Store card shows logo/avatar or fallback icon; "Open in Dashboard" → navigates to `/app/store/<storeId>/review`.
- **Header dropdown:** "My Stores" section with store avatar + name; click → `/app/store/<storeId>/review`.

---

## 6-Step Manual Test Checklist

1. **Publish as real user**  
   - Log in as a real account (e.g. jo'sbanhmi@cardbey.com). Create/publish a store.  
   - **Expect:** After publish, /account shows one store card (name, avatar or icon, "Open in Dashboard").  
   - **Expect:** Header account dropdown shows "My Stores" with that store; click goes to `/app/store/<id>/review`.

2. **Refresh persistence**  
   - From /account, refresh the page.  
   - **Expect:** Store card still visible (server-backed from GET /api/auth/me).

3. **Open store from Account**  
   - On /account, click "Open in Dashboard" on the store card.  
   - **Expect:** Navigate to `/app/store/<storeId>/review` (store management, not public preview).

4. **Open store from header**  
   - Open header account dropdown, click the store under "My Stores".  
   - **Expect:** Navigate to `/app/store/<storeId>/review`.

5. **Publish as guest (must be blocked)**  
   - Log out or use incognito; start as guest, create draft, attempt publish.  
   - **Expect:** 401 / "Please sign in or create an account to publish your store." No new Business linked to a guest.

6. **Existing guest-linked store (if any)**  
   - If a store was previously published as guest, log in as the real user and open /account.  
   - **Expect:** That store may still not appear (it’s still linked to the guest user). One-time fix (e.g. JO'S BANH MI): set Business.userId to the real user id for that store in DB (e.g. Prisma: update Business set userId = realUserId where id = storeId). Then GET /api/auth/me returns it. Alternatively re-publish after login or add a claim endpoint later.
