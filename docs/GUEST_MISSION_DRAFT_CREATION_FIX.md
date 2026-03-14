# Guest Mission Draft Creation — Root Cause & Fix

**Goal:** Guest create-store mission can generate a draft without foreign key failure; guest can reach draft review; publish remains auth-protected.

---

## 1. Exact root cause

### Failing path

| Step | Where | What happens |
|------|--------|----------------|
| 1 | `apps/core/cardbey-core/src/routes/miRoutes.js` | **handleOrchestraStart** (POST /api/mi/orchestra/start) runs with `requireAuth`. Guest has JWT so `req.user = { id: 'guest_...', role: 'guest' }`, `req.userId = 'guest_...'`. |
| 2 | Same | `finalTenantId = tenantId \|\| contextTenantId \|\| req.userId` → `'guest_...'`. OrchestratorTask created with `tenantId`, `userId: req.userId`. |
| 3 | Same | When `needDraft`, handler calls **createDraftStoreForUser(prisma, { user: req.user, userId: req.userId, tenantKey: getTenantId(req.user) ?? finalTenantId, input: baseInput, ... })**. |
| 4 | `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` | **createDraftStoreForUser** sets `ownerUserId = user?.id ?? userId ?? null` → `'guest_...'`, `resolvedTenantId` → `'guest_...'`, then **prisma.draftStore.create({ ...rest, ownerUserId, input: inputWithTenant })**. |
| 5 | DB | **Foreign key violation**: `DraftStore.ownerUserId` references **User.id**. Guest users are **not** in the User table — auth middleware treats guest JWT as valid and sets `req.user = { id, role: 'guest' }` without a DB lookup (see `auth.js`: “Minimal guest token: no DB lookup”). So no row exists with `User.id = 'guest_...'` and the insert fails. |

### Exact failing constraint

- **Table:** `DraftStore`
- **Column:** `ownerUserId` (FK to `User.id`)
- **Cause:** Insert with `ownerUserId = 'guest_...'` where no `User` row has `id = 'guest_...'`.

### Why tenantIdCandidate is guest_*

- `tenantKey` passed to createDraftStoreForUser is `getTenantId(req.user) ?? finalTenantId`.
- **getTenantId(user)** returns `user?.business?.id ?? user?.id ?? null`. For guest, `req.user` has no `business` and `user.id` is `'guest_...'`.
- So both `ownerUserId` and `resolvedTenantId` (and thus `input.tenantId`) become `'guest_...'`. The FK that actually fails is **ownerUserId → User.id**; the log shows both for clarity.

---

## 2. How Quick Start avoids auth today (guest draft)

| Aspect | Quick Start | Mission flow (before fix) |
|--------|-------------|----------------------------|
| **Route** | POST /api/draft-store/generate (or similar) with optionalAuth / guest | POST /api/mi/orchestra/start with requireAuth (guest token allowed) |
| **Draft creation** | **createDraft({ mode, input, meta: { ownerUserId: null, ... } })** — no FK to User | **createDraftStoreForUser(...)** with `ownerUserId = req.userId` → guest id → FK fail |
| **Storage** | DraftStore row with **ownerUserId: null**, optional guestSessionId | N/A (failed before create) |
| **Access** | Draft review by generationRunId / draftId; access logic allows null owner / temp | Same access possible once draft exists |

Quick Start guest path uses **createDraft** with **ownerUserId: null**, so no User FK is involved. The mission flow was using **createDraftStoreForUser** for every user, including guest, which caused the violation.

---

## 3. Smallest safe fix (implemented)

### Option chosen: **Reuse Quick Start guest draft path**

- For **guest** users (`req.user?.role === 'guest'`), create the draft with **createDraft** (ownerUserId null) instead of **createDraftStoreForUser**.
- For **authed** users, keep **createDraftStoreForUser** so GET /draft-store/:id/summary and ownership stay correct.

### Exact change

**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

1. **Import:** Add **createDraft** to the import from `../services/draftStore/draftStoreService.js`.

2. **handleOrchestraStart (needDraft block):**  
   When **isGuest** (already computed as `req.user?.role === 'guest'`):
   - Call **createDraft({ mode: baseInput.mode, input: baseInput, meta: { generationRunId: resolvedRunId, ownerUserId: null, guestSessionId: req.guestSessionId ?? undefined } })**.
   - Use the returned draft for `responseDraftId` / `createdDraftId` and continue with **runBuildStoreJob** as before.

   When **not** guest:
   - Keep the existing **createDraftStoreForUser(prisma, { user, userId, tenantKey, input: baseInput, ... })** call unchanged.

### Why safe

- Same guest draft contract as Quick Start: **ownerUserId: null**, optional guestSessionId.
- No new routes or tables; no change to publish or claim flow.
- Authed users unchanged; only the **branch** for draft creation in handleOrchestraStart differs by guest vs non-guest.

### Should guest missions reuse Quick Start temp draft path?

**Yes.** They now do: guest mission draft is created with **createDraft** (same as Quick Start guest), so the same temp-draft path and access rules apply. No separate “guest tenant” or null-tenant schema change required.

---

## 4. Guest mission events 403

### Observation

- **GET /api/mi/missions/:missionId/events?limit=200** returns **403** for guest users.
- Likely cause: endpoint is protected with **requireAuth** and a “mission owner” check that either rejects `role === 'guest'` or resolves mission ownership via a table (e.g. Mission or OrchestratorTask) and denies when the owner is not a “real” user.

### Where it lives

- The events route is not in **miRoutes.js** in this repo; it may live in another router (e.g. miIntentsRoutes) or another app, mounted under `/api/mi`.
- Frontend: **ExecutionDrawer** calls **listMissionEvents(mission.id, 200)** only when **missionStartedOnServer** is true, so 403s were already limited to “mission started on server” cases.

### Must events 403 be fixed for MVP?

- **No.** For MVP, the blocking issue was **draft creation 500**. With the fix above:
  - Guest can start a create-store mission.
  - Guest can generate a draft (no FK failure).
  - Guest can reach draft review (same temp/guest draft flow as Quick Start).
  - Publish still requires auth/claim.
- The events 403 only affects the **Agent Timeline** in the Execution drawer (e.g. no events list for guest). It does not block opening the drawer or reaching draft review. A follow-up fix can allow guest to read events when `missionId` is an OrchestratorTask id and `task.userId === req.userId` (guest).

---

## 5. Risks

| Risk | Mitigation |
|------|------------|
| Guest draft summary access | Same as Quick Start: drafts with **ownerUserId: null** are already allowed by existing access logic for temp/guest (e.g. by generationRunId or draftId in context). No change to that logic in this fix. |
| Backfill overwriting guest draft | Backfill in GET summary only sets ownerUserId when `draft.input?.tenantId === tenantKey` and `req.user?.id`. For guest-created drafts, input.tenantId is not set to guest_... in createDraft, so backfill won’t run; no overwrite. |
| Authed path regressions | Only the `if (isGuest)` branch was added; authed branch is unchanged. |

### What was not changed

- Publish / claim flow.
- requireAuth or optionalAuth on any route.
- DraftStore schema or FKs.
- Quick Start or any other create path.

---

## 6. Manual verification steps

- [ ] **Guest opens /app** — No redirect to login; Mission Console loads.
- [ ] **Guest starts create-store mission** — Enters goal (e.g. “Create a store”), fills store input, runs. POST /api/mi/orchestra/start returns **200** with jobId and draftId.
- [ ] **No 500 on draft creation** — Server logs show no FK violation; OrchestratorTask moves to running then completed (or failed for non-FK reasons).
- [ ] **Guest reaches draft review** — From mission/drawer, open draft review (e.g. link with storeId=temp and jobId/generationRunId). Draft loads without sign-in.
- [ ] **Guest clicks publish** — Sign-in/sign-up is required; after auth, claim and publish continue.
- [ ] **Authed user unchanged** — Log in as real user; start create-store mission; draft is created with createDraftStoreForUser; GET /draft-store/:id/summary returns 200 for that user.

---

## Summary

- **Root cause:** handleOrchestraStart always used **createDraftStoreForUser** with `ownerUserId = req.userId`. For guest, that is `'guest_...'`, and **DraftStore.ownerUserId** FK to **User.id** fails because guest users are not in the User table.
- **Fix:** When **isGuest**, use **createDraft** (ownerUserId null), matching the Quick Start guest path. Authed users still use createDraftStoreForUser.
- **Events 403:** Not fixed in this change; not required for MVP. Can be fixed later by allowing guest to read events when they own the mission (e.g. OrchestratorTask.userId === req.userId).
