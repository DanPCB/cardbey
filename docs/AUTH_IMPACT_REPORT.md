# Auth impact report: Draft Review payload (anon vs authed)

**Goal:** Determine if auth gating caused hero/avatar/categories to disappear for anonymous users on the Draft Review Editor.

---

## Which endpoint differs

| Endpoint | Auth | Before fix | After fix |
|----------|------|------------|-----------|
| **GET /api/stores/:storeId/draft** | Was `requireAuth` | Anon received **401** before handler ran → no payload at all | **optionalAuth**; when `storeId === 'temp'`, anon gets **200** with **identical** payload (draft, draft.preview, products, categories) |
| GET /api/public/store/:storeId/draft | None | Same shape as authed (returns `draft` via resolveDraftForStore) | Unchanged |

**Conclusion:** The regression was caused by **GET /api/stores/:storeId/draft** requiring auth. Anonymous users (incognito / no cookie) never received any payload (401), so hero/avatar/categories “disappeared” because the request failed, not because the backend stripped fields. The **public** draft route (`/api/public/store/:storeId/draft`) does return the full `draft` object, but in **draft mode** the frontend calls **only** `/api/stores/:id/draft` and does not fall back to public when unauthenticated, so anon always saw error state.

---

## Which middleware is responsible

- **Before:** `router.get('/:storeId/draft', requireAuth, ...)` in **apps/core/cardbey-core/src/routes/stores.js**
  - `requireAuth` (apps/core/cardbey-core/src/middleware/auth.js) returns **401** when no/invalid token; handler never runs for anon.
- **After:** `router.get('/:storeId/draft', optionalAuth, ...)` with an **in-handler** check:
  - If `storeId !== 'temp'` and `!req.user && !req.userId` → return 401 (store-specific draft still requires auth).
  - If `storeId === 'temp'` → same handler as before; **identical response shape** for anon and authed (no stripping of draft/preview).

---

## Minimal patch to equalize payload shape

**Backend (done):**

1. **apps/core/cardbey-core/src/routes/stores.js**
   - Import `optionalAuth` from `../middleware/auth.js`.
   - Change GET `/:storeId/draft` from `requireAuth` to `optionalAuth`.
   - At the start of the handler, after reading `storeId`:
     - If `storeId !== 'temp'` and `!req.user && !req.userId` → `return res.status(401).json({ ok: false, error: 'unauthorized_token_required', message: '...' })`.
     - Otherwise run existing logic unchanged (same JSON: ok, storeId, generationRunId, status, draftId, **draft**, store, products, categories).

**Result:** GET /api/stores/temp/draft is **readable by anon** with the **same payload shape** as authed (including `draft.preview` for hero/avatar/categories). No mutations for anon; write/update/publish remain authed elsewhere.

**Frontend (already in place):**

- Do **not** drop `draft.preview` when `error` is set but `draft` exists: `getStoreReviewPageBranch()` returns `'editor'` when draft is present, so error UI does not replace the editor.
- Auth banner: ensure any “sign in” banner does **not** hide or replace the editor layout when draft exists; show banner above or beside the editor if needed.

---

## Repro matrix & diff

**Capture (same jobId / generationRunId):**

1. **Authed:** Log in, open Draft Review, DevTools → Network → XHR/Fetch → GET `.../draft?generationRunId=...` → Copy response → save as **tmp/draft_authed.json**.
2. **Anon:** Incognito (or clear cookies), same URL (you may need to open from a link that includes jobId/generationRunId), same request → Copy response → save as **tmp/draft_anon.json**.

**Diff:**

```bash
node tmp/diff_draft_payloads.js
```

Answers:

- **Are hero/avatar fields missing only for anon?** If before fix anon got 401, there was no payload to compare; after fix, both authed and anon get the same `draft.preview` (hero/avatar in preview.hero, preview.avatar, preview.brand).
- **Are categories/sections missing only for anon?** Same: after fix, `products` and `categories` are present for both.
- **Field names:** Backend uses `draft.preview` (object or JSON string) with `preview.hero.imageUrl`, `preview.avatar.imageUrl`, `preview.brand.logoUrl`, `preview.categories`; no difference between anon and authed.
- **401/403 fallback:** Previously, 401 on GET /api/stores/temp/draft caused the frontend to throw and set error, so draft state was never set. There is no “fallback state that wipes draft.preview” on 401—the draft simply never arrived. After the fix, anon gets 200 and the same payload, so no 401 and no wipe.

---

## How to verify

1. **Anon:** Open `/app/store/temp/review?mode=draft&jobId=<jobId>` in incognito (with valid generationRunId in URL or from job). Page should load editor (hero, avatar, categories) without requiring login.
2. **Authed:** Same URL while logged in; same hero/avatar/categories and layout.
3. **Network:** In both cases, GET `.../stores/temp/draft?generationRunId=...` returns 200 with `draft`, `draft.preview`, `products`, `categories`.
4. **Non-temp:** GET `/api/stores/<realStoreId>/draft` without auth returns 401 (unchanged).
5. Run `node tmp/diff_draft_payloads.js` after saving draft_authed.json and draft_anon.json; “same top-level keys” and “both have draft” with same preview shape.
