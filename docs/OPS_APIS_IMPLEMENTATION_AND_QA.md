# Ops APIs Implementation & Manual QA

**Date:** 2026-02-27  
**Scope:** Read-only ops (status, audit-trail), system repair gating, image ops (detect-mismatch, rebind-by-stable-key). No kernel or product flow changes.

---

## Risk assessment (LOCKED RULE)

- **Draft-store generate/commit, preview, publishing, image rendering, auth:** No changes. New routes only; existing flows untouched. Status and audit-trail are read-only. Image rebind updates only `draft.preview` (item imageUrl); no status transition, no kernel bypass.
- **Monitoring consumers:** GET /api/system/metrics and /diagnose remain unauthenticated. Only POST /api/system/repair/* are gated; if any consumer called repair without auth, they will now get 403 until they send an admin token.
- **Image mapping:** detect-mismatch and rebind use the same stable-key semantics as dashboard `itemImageMapping.ts`. Rebind only updates preview JSON; public/grid/list continue to use getItemImage(imageByStableKey) as before.

---

## 1. Files changed

| File | Change |
|------|--------|
| `apps/core/cardbey-core/src/routes/opsRoutes.js` | **New.** GET /api/ops/status, GET /api/ops/audit-trail; requireAuth + requireAdmin; mount /images → opsImageRoutes. |
| `apps/core/cardbey-core/src/routes/opsImageRoutes.js` | **New.** POST /api/ops/images/detect-mismatch, POST /api/ops/images/rebind-by-stable-key; requireAuth + requireAdmin; rebind apply gated by OPS_IMAGE_REBIND_ENABLED. |
| `apps/core/cardbey-core/src/services/ops/opsImageService.js` | **New.** getItemStableKey, buildImageByStableKey, detectMismatchesDraftStore, rebindDraftStoreByStableKey (preview-only update). |
| `apps/core/cardbey-core/src/server.js` | Import opsRoutes; mount app.use('/api/ops', opsRoutes). |
| `apps/core/cardbey-core/src/routes/systemRoutes.js` | Import requireAuth, requireAdmin; add repairGate to all POST /repair/*. |
| `apps/core/cardbey-core/src/middleware/auth.js` | Log on 403 in requireAdmin (path, method, userId). |

---

## 2. Routing / behavior

- **GET /api/ops/status:** Query params entityType (DraftStore | OrchestratorTask | Store | Device), entityId. Returns minimal record + status + updatedAt; progress when applicable. Request/result redacted for secrets.
- **GET /api/ops/audit-trail:** Query params entityType (DraftStore | OrchestratorTask), entityId, limit (default 50, max 200). Returns AuditEvent rows newest-first.
- **POST /api/system/repair/*:** All four repair endpoints now run requireAuth then requireAdmin. 403 is logged in auth middleware.
- **POST /api/ops/images/detect-mismatch:** Body { entityType, entityId }. DraftStore: compares preview items to canonical imageByStableKey; returns mismatches. Store: returns empty (no mapping in core).
- **POST /api/ops/images/rebind-by-stable-key:** Body { entityType, entityId, dryRun }. dryRun=true returns proposed changes only. dryRun=false: if OPS_IMAGE_REBIND_ENABLED, updates draft.preview (items/catalog.products imageUrl) and creates AuditEvent (ops_rebind_by_stable_key); otherwise 403 with message to use env flag.

---

## 3. Manual QA checklist

### Ops read-only (status + audit-trail)

- [ ] **No auth:** `curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001/api/ops/status?entityType=DraftStore&entityId=some-id"` → 401.
- [ ] **Non-admin:** With a valid user token that is not admin, GET /api/ops/status and GET /api/ops/audit-trail → 403.
- [ ] **Admin:** With admin token, GET /api/ops/status?entityType=DraftStore&entityId=<real-draft-id> → 200; body has ok, entityType, entityId, record (id, status, updatedAt, etc.).
- [ ] **Admin:** GET /api/ops/audit-trail?entityType=DraftStore&entityId=<real-draft-id>&limit=10 → 200; body has ok, events (array), count.
- [ ] **Unknown entityId:** GET /api/ops/status?entityType=DraftStore&entityId=nonexistent → 404.
- [ ] **Invalid entityType:** GET /api/ops/status?entityType=Invalid&entityId=x → 400.

### System repair gating

- [ ] **POST without auth:** `curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:3001/api/system/repair/clear-cache"` → 401.
- [ ] **POST with non-admin:** With non-admin token, POST /api/system/repair/clear-cache → 403; server log shows "[Auth] Admin required, request blocked (403)".
- [ ] **POST with admin:** With admin token, POST /api/system/repair/clear-cache → 200 and stub body { ok: true, status: "cache_cleared" }.
- [ ] **GET unchanged:** GET /api/system/metrics and GET /api/system/diagnose without auth → 200.

### Image ops

- [ ] **detect-mismatch (DraftStore):** Create or pick a draft whose preview has items with inconsistent imageUrl vs stable-key map. POST /api/ops/images/detect-mismatch with body { entityType: "DraftStore", entityId: "<id>" } as admin → 200; mismatches array reflects issues (or empty if none).
- [ ] **rebind dryRun:** Same draft; POST /api/ops/images/rebind-by-stable-key { entityType: "DraftStore", entityId: "<id>", dryRun: true } as admin → 200; body has changes (array), applied: false.
- [ ] **rebind apply (flag off):** POST with dryRun: false without OPS_IMAGE_REBIND_ENABLED → 403, message mentions OPS_IMAGE_REBIND_ENABLED.
- [ ] **rebind apply (flag on):** Set OPS_IMAGE_REBIND_ENABLED=true; POST rebind dryRun: false → 200, applied: true; GET draft preview shows updated imageUrl; AuditEvent exists with action ops_rebind_by_stable_key; detect-mismatch again → mismatches empty or reduced.
- [ ] **Public/grid:** After rebind, open draft review and public grid → images still resolve via key-based mapping; no regression.

---

## 4. Example curl (ops read-only)

```bash
# Replace <ADMIN_TOKEN> and <DRAFT_ID>
curl -s -H "Authorization: Bearer <ADMIN_TOKEN>" "http://localhost:3001/api/ops/status?entityType=DraftStore&entityId=<DRAFT_ID>"
curl -s -H "Authorization: Bearer <ADMIN_TOKEN>" "http://localhost:3001/api/ops/audit-trail?entityType=DraftStore&entityId=<DRAFT_ID>&limit=50"
```

---

## 5. Backward compatibility

- No existing routes removed or renamed.
- No UI changes required.
- Draft-store generate/commit, orchestra, kernel transitions, and dashboard image resolution are unchanged.
