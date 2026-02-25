# Draft store by-store / create-from-store — verification

## Risk (LOCKED RULE)

- **Orchestra flow unchanged:** POST /api/mi/orchestra/start → GET /api/stores/temp/draft?generationRunId=... → PATCH /api/draft-store/:draftId → POST /api/store/publish. No existing routes or response shapes were changed. Only **new** routes were added: GET /api/draft-store/by-store/:storeId and POST /api/draft-store/create-from-store.
- **Safeguard:** All new logic lives in new route handlers; no changes to orchestra or temp/draft handlers.

---

## Code changes

### Backend (cardbey-core)

| File | Change |
|------|--------|
| `src/routes/draftStore.js` | Imports: `normalizePreviewCategories`, `resolveDraftForStore`, `slugify`. **GET /by-store/:storeId** (requireAuth): resolve store ownership (Business.userId === req.userId), 404 store not found, 403 wrong user, resolve draft via resolveDraftForStore(prisma, storeId, null), 404 if no draft, else 200 with { ok, draftId, storeId, status, preview, mode, input, error }. **POST /create-from-store** (requireAuth): body { storeId }, same ownership check, load Business + Products, build preview (storeName, storeType, categories, items, hero, avatar, brandColors, meta.storeId), normalizePreviewCategories(preview), create DraftStore (mode 'personal', status 'ready', input { storeId, source: 'create-from-store' }), return 201 { ok, draftId, storeId, status }. |

### Tests

| File | Change |
|------|--------|
| `tests/draft-store-by-store.test.js` | **New.** GET by-store: 404 when no draft; 401 no auth; 403 when store belongs to another user. POST create-from-store: creates draft then GET by-store returns it; 401 no auth; 403 wrong user; 404 store not found. |

---

## Manual verification checklist

### cURL (replace TOKEN and STORE_ID)

```bash
# 1. GET by-store returns 404 when no draft (authenticated)
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer TOKEN" \
  "http://localhost:3001/api/draft-store/by-store/STORE_ID"
# Expect: 404

# 2. GET by-store returns 401 when not authenticated
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:3001/api/draft-store/by-store/STORE_ID"
# Expect: 401

# 3. POST create-from-store creates draft (authenticated owner)
curl -s -X POST "http://localhost:3001/api/draft-store/create-from-store" \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"storeId":"STORE_ID"}'
# Expect: 201, body has ok: true, draftId, storeId, status: "ready"

# 4. GET by-store returns 200 with draft after create (same token)
curl -s -H "Authorization: Bearer TOKEN" \
  "http://localhost:3001/api/draft-store/by-store/STORE_ID"
# Expect: 200, body has ok: true, draftId, preview.storeName, preview.categories, preview.items

# 5. POST create-from-store returns 403 when store belongs to another user (use different user token)
# 6. POST create-from-store returns 404 when storeId does not exist
```

### UI (Performer onboarding autosave)

1. Log in as a user who has at least one store (Business).
2. Open Performer onboarding (or any flow that calls GET /api/draft-store/by-store/:storeId). Previously: 404. Now: 404 if no draft; if the flow first calls POST create-from-store, then GET by-store should return 200 with the draft.
3. Confirm autosave no longer 404s: create-from-store is called when needed, then by-store returns the draft.

---

## Run tests

```bash
cd apps/core/cardbey-core
pnpm test -- tests/draft-store-by-store.test.js --run
```
