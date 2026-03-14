# DraftStore ownerUserId Backfill + Create Paths (Phase 0)

**Date:** 2026-03-03  
**Locked rule:** No widening of cross-tenant access; minimal diffs.

---

## Risk assessment (before coding)

- **Backfill on summary:** We only set `ownerUserId` when `draft.input.tenantId === tenantKey` and `req.user` exists. So we assign ownership to the user who **already** matches the draft’s tenant. `canAccessDraftStore` already allows access when tenant matches; we do not relax any rule. **Safe.**
- **POST /generate → createDraftStoreForUser when authed:** Same as existing create paths: we set `ownerUserId` and `input.tenantId` to the acting user. Guest path unchanged (still `createDraft` with `ownerUserId: null`). **Safe.**
- **Dev assert (template + null ownerUserId):** Throws only in non-production; no production behavior change. **Safe.**

---

## A) Safe backfill on read (GET summary)

- **File:** `apps/core/cardbey-core/src/routes/draftStore.js`
- **Change:** In `GET /api/draft-store/:draftId/summary`, after loading the draft and computing `tenantKey`:
  - If `draft.ownerUserId == null` and `draft.input?.tenantId === tenantKey` and `req.user?.id`:
    - `prisma.draftStore.update({ where: { id: draftId }, data: { ownerUserId: req.user.id } })`
    - Log (dev-only): `[DraftStore] backfilled ownerUserId` with draftId and ownerUserId
    - Set `draft = { ...draft, ownerUserId: req.user.id }` so the rest of the handler (and `canAccessDraftStore`) see the updated value.
  - Then run the existing `canAccessDraftStore` check and return 200 or 403 as before.

---

## B) Remaining draft creation path

- **Path found:** `POST /api/draft-store/generate` in `draftStore.js` was the only remaining caller of `createDraft()`. It can create template-mode drafts (mode comes from request body).
- **Change:** When `req.userId` or `req.user` is present, use `createDraftStoreForUser(prisma, { user: req.user, userId: req.userId, tenantKey: getTenantId(req.user), input, expiresAt, mode, status: 'generating', ipHash, userAgent, guestSessionId })`. When not authenticated (guest), keep `createDraft({ mode, input, meta: { ..., ownerUserId: null } })`.

---

## C) Dev-only assert in createDraftStoreForUser

- **File:** `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js`
- **Change:** In the existing DEV block after create: if `draft.mode === 'template'` and `draft.ownerUserId` is null or empty, throw (dev only): `[DraftStore] createDraftStoreForUser: template mode must have ownerUserId (dev assert)`.

---

## Files changed

| File | Change |
|------|--------|
| `apps/core/cardbey-core/src/routes/draftStore.js` | (A) Backfill in GET `/:draftId/summary`: when ownerUserId null and tenant matches, update and set ownerUserId; (B) POST `/generate`: use createDraftStoreForUser when authed, else createDraft. |
| `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` | (C) Dev assert: template mode must have ownerUserId. |
| `docs/DRAFT_STORE_OWNER_BACKFILL_AND_CREATE_PATHS.md` | This document. |

---

## QA

1. **Store Mission Phase 0 summary no longer 403 for new drafts:** Run Store Mission Phase 0 (template mode); create draft; immediately call GET `/api/draft-store/:draftId/summary` with same user → **200**.
2. **Existing drafts (ownerUserId null) become accessible after one summary call:** Pick an existing draft row with `ownerUserId = null` and `input.tenantId` equal to your user’s tenant; call GET summary once as that user → **200**; call again → **200**; in Prisma Studio, that row now has `ownerUserId` set.
3. **Prisma Studio:** New template drafts show `ownerUserId` and `input.tenantId` populated.
4. **Guest:** POST `/generate` without auth still works (createDraft path); no regression.
