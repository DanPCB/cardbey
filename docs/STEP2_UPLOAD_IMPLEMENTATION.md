# Step 2 Upload Implementation — Risk, Invariants, Plan

## 1) Risk & invariants (locked rule)

### What could break
- **DraftStore status writes:** Any `prisma.draftStore.update` that sets `status` or `committedStoreId` bypasses the transition service → we **only** update `preview` JSON.
- **Publish contract:** No change to `POST /api/store/publish` request/response.
- **Auth scope:** New routes must use `requireAuth` and resolve draft ownership (generationRunId for temp, storeId for existing) → 403 if not owner.
- **Frontscreen:** No change to storefront/frontscreen; they keep reading published Business only.
- **Preview shape:** We only **add** hero/avatar URL fields to existing preview shape; we do not remove or rename keys so publishDraftService and dashboard keep working.

### Invariants
- No ad-hoc DraftStore status/committedStoreId updates; only `preview` payload.
- Publish remains idempotent; no change to publish pipeline.
- Auth: requireAuth on all new routes; ownership enforced via existing isDraftOwnedByUser / store owner check.
- Separation: frontscreen unchanged.
- Minimal diff: additive routes only; reuse existing upload (uploadBufferToS3, Media, normalizeMediaUrlForStorage).

### Minimal-diff plan
1. **Dashboard alignment:** Dashboard uses POST `/api/stores/:id/upload/hero` with FormData field `file`, and PATCH `/api/stores/:id/draft/hero` with body `{ imageUrl, videoUrl, source }`. Avatar in branding modal uses generic `/uploads/create`; we add POST upload/avatar for parity.
2. **Reuse upload infra:** Use same flow as `routes/upload.js`: multer `file`, `uploadBufferToS3`, `resolvePublicUrl`, `normalizeMediaUrlForStorage`, `prisma.media.create` (kind IMAGE), then return URL.
3. **Persist to draft only:** After upload, call `patchDraftPreview(draftId, { hero: { imageUrl, url }, heroImageUrl }` or same for avatar) so preview is updated; no status change.
4. **PATCH draft/hero:** Accept both `imageUrl` (dashboard) and `heroImageUrl`; map to same preview shape. Add PATCH draft/avatar for URL-only updates.
5. **Routes in stores.js:** Add POST `/:storeId/upload/hero`, POST `/:storeId/upload/avatar`; extend PATCH `/:storeId/draft/hero`; add PATCH `/:storeId/draft/avatar`. All requireAuth + ownership.

---

## 2) Exact files changed

| Path | Change |
|------|--------|
| `apps/core/cardbey-core/src/routes/stores.js` | Add multer (image only, field `file`). Add POST `/:storeId/upload/hero` and `/:storeId/upload/avatar` (upload → persist to draft preview → return URL). Extend PATCH `/:storeId/draft/hero` to accept `imageUrl` (and `videoUrl`). Add PATCH `/:storeId/draft/avatar`. |
| `docs/STEP2_UPLOAD_IMPLEMENTATION.md` | This file: risk, invariants, plan, how to test, assumptions. |

---

## 2b) Implementation checklist (minimal diff, deterministic)

- **Route resolution & ownership:** Single helper `resolveDraftForStoreAsset(req)` in stores.js: for `storeId === "temp"` requires `generationRunId` (query or body), uses `isDraftOwnedByUser` then `getDraftByGenerationRunId`; else resolves via `resolveDraftForStore` and verifies business ownership. Returns `{ draft }` or `{ errorResponse: { status, body } }`. Used by POST upload/hero, upload/avatar, and PATCH draft/hero, draft/avatar.
- **Multer:** `memoryStorage()`, field `file`, mime allowlist `image/jpeg`, `image/png`, `image/webp`, `image/gif`. Invalid or missing file → 400 (wrapper converts multer errors to 400).
- **Upload pipeline:** Reuse `uploadBufferToS3`, `resolvePublicUrl`, `normalizeMediaUrlForStorage`; `prisma.media.create` wrapped in try/catch — on failure log warning and continue (draft preview still updated).
- **Preview merge:** When patching after upload (or in PATCH hero/avatar), merge with existing `preview.hero` / `preview.avatar` so `videoUrl`, `source`, etc. are not wiped. Set both flattened and nested: `heroImageUrl` + `preview.hero.imageUrl`/`url`; same for avatar.
- **PATCH draft/hero:** Accept dashboard payload `{ imageUrl, videoUrl, source }`; map to `preview.hero` (and optionally `heroImageUrl`). Store `source` under `preview.hero.source` (additive).
- **Temp route symmetry:** Routes `/:storeId/upload/hero`, `/:storeId/upload/avatar`, `/:storeId/draft/hero`, `/:storeId/draft/avatar` all support `storeId === "temp"` via the resolver (query or body `generationRunId`); no special-case routing.

---

## 3) How to test

### Auth token (do this first)

**PowerShell** (use `$env:AUTH_TOKEN` — `%AUTH_TOKEN%` does not interpolate):
```powershell
$r = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}'
$env:AUTH_TOKEN = $r.token
```

**Bash/zsh:**
```bash
export AUTH_TOKEN=$(curl -s -X POST "http://localhost:3001/api/auth/login" -H "Content-Type: application/json" -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}' | jq -r '.token')
```

### Commands (API running at http://localhost:3001)

**1. Hero upload (multipart, field `file`)**

PowerShell:
```powershell
curl -X POST "http://localhost:3001/api/stores/temp/upload/hero?generationRunId=YOUR_RUN_ID" `
  -H "Authorization: Bearer $env:AUTH_TOKEN" `
  -F "file=@C:\path\to\hero.jpg"
```

Bash/zsh:
```bash
curl -X POST "http://localhost:3001/api/stores/temp/upload/hero?generationRunId=YOUR_RUN_ID" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -F "file=@/path/to/hero.jpg"
```
Expect: `{ "ok": true, "url": "<url>", "heroImageUrl": "<url>" }`. Draft preview should contain the hero URL (GET draft to confirm).

**2. Avatar upload**

PowerShell:
```powershell
curl -X POST "http://localhost:3001/api/stores/temp/upload/avatar?generationRunId=YOUR_RUN_ID" `
  -H "Authorization: Bearer $env:AUTH_TOKEN" `
  -F "file=@C:\path\to\avatar.jpg"
```

Bash/zsh:
```bash
curl -X POST "http://localhost:3001/api/stores/temp/upload/avatar?generationRunId=YOUR_RUN_ID" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -F "file=@/path/to/avatar.jpg"
```
Expect: `{ "ok": true, "url": "<url>", "avatarImageUrl": "<url>" }`.

**3. PATCH hero (set by URL — dashboard shape)**

PowerShell:
```powershell
curl -X PATCH "http://localhost:3001/api/stores/temp/draft/hero?generationRunId=YOUR_RUN_ID" `
  -H "Authorization: Bearer $env:AUTH_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{\"imageUrl\":\"https://example.com/hero.jpg\"}'
```

Bash/zsh:
```bash
curl -X PATCH "http://localhost:3001/api/stores/temp/draft/hero?generationRunId=YOUR_RUN_ID" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"imageUrl":"https://example.com/hero.jpg"}'
```
Expect: `{ "ok": true, "draftId", "status" }`.

**4. PATCH avatar**
```bash
# Bash/zsh
curl -X PATCH "http://localhost:3001/api/stores/YOUR_STORE_ID/draft/avatar" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"avatarImageUrl":"https://example.com/avatar.jpg"}'
```

**5. Load draft and confirm URLs**
```bash
# Bash/zsh
curl -s "http://localhost:3001/api/stores/temp/draft?generationRunId=YOUR_RUN_ID" -H "Authorization: Bearer $AUTH_TOKEN"
```
Check `draft.preview.heroImageUrl`, `draft.preview.avatarImageUrl`, `draft.preview.hero.imageUrl`, `draft.preview.avatar.imageUrl`.

**6. Publish and confirm Business**
After publish, GET the store or frontscreen and confirm Business.heroImageUrl / avatarImageUrl are set (or fallback used).

### Verification (tight acceptance — 4 assertions)

After implementing, verify:

1. **Upload returns 200 + URL fields:** `ok === true`, `url` exists, `heroImageUrl` / `avatarImageUrl` exists (both keys returned for dashboard compatibility).
2. **Draft GET shows URL in both places:** `draft.preview.heroImageUrl` and `draft.preview.hero.imageUrl` (and same for avatar).
3. **Publish uses uploaded URLs (not fallback):** After publish, Business.heroImageUrl / avatarImageUrl match the uploaded URLs.
4. **Unauthorized user gets 403:** Attempt to upload (or PATCH) with someone else’s `generationRunId` or `storeId` returns 403.

### Manual verification (Steps 1–5)

1. Create draft store (e.g. via Quick Create or orchestra/start; note `generationRunId`).
2. Upload hero: `POST /api/stores/temp/upload/hero?generationRunId=<runId>` with `file`; expect 200 and `heroImageUrl`.
3. Upload avatar: `POST /api/stores/temp/upload/avatar?generationRunId=<runId>` with `file`; expect 200 and `avatarImageUrl`.
4. Load draft: `GET /api/stores/temp/draft?generationRunId=<runId>`; confirm `draft.preview.heroImageUrl`, `draft.preview.avatarImageUrl` (and `draft.preview.hero.imageUrl`, `draft.preview.avatar.imageUrl`) are set.
5. Publish: `POST /api/store/publish` with `{ storeId: 'temp', generationRunId: '<runId>' }`; then check Business row or frontscreen — hero/avatar should be the uploaded URLs (or fallback if something failed).

---

## 4) Assumptions about existing upload/storage

- **uploadBufferToS3** (lib/s3Client.js): exists; returns `{ key, url }`; falls back to local storage if S3 not configured.
- **resolvePublicUrl**, **normalizeMediaUrlForStorage** (utils/publicUrl.js): used to produce a stable URL for storage and response.
- **prisma.media**: Media model exists; we create a record with url, storageKey, kind, mime, etc., for auditability and reuse.
- **Multer:** Not currently used in stores.js; we add it (memory storage, field `file`, image types only) to avoid changing upload.js.
