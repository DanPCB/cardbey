# E2E Store Creation — Master Output (Cursor Master Prompt)

**Date:** 2026-03-04  
**Mission:** Finish Store Creation end-to-end (French Baguette test case). Campaign V2 **PAUSED**.

---

## 1) RISK & INVARIANTS (from the locked rule)

### A) What could break the current end-to-end workflow

| Risk | Why | Impact |
|------|-----|--------|
| **DraftStore status writes outside transition service** | Any `prisma.draftStore.update({ status: ... })` or `committedStoreId` set without `transitionDraftStoreStatus` breaks WorkflowRun sync and AuditEvent. | Draft never reaches `ready`/`committed`; publish fails or duplicates. |
| **Changing publish endpoint contract** | `POST /api/store/publish` body (`storeId`, `generationRunId`) or response shape is used by the dashboard. | Publish button fails or wrong success state. |
| **Frontscreen reading draft** | If storefront API returned draft-only data for “published” list, Step 5 would be wrong. | Frontscreen shows draft data or missing stores. |
| **Auth middleware order/scope** | Changing middleware on `/api/store/publish`, `/api/draft-store`, `/api/mi/orchestra/start` can block valid auth or allow unauthorized access. | 401/403 for valid users or unauthorized publish. |
| **Removing publish idempotency** | If `publishDraft` always created a new Business when draft is already `committed`, duplicate stores appear. | Step 4 fails; duplicate stores on double-click. |
| **Category/preview shape change** | Changing `preview.categories`/`preview.items` or normalization without updating dashboard and publish breaks preview and publish. | Steps 3 and 4; wrong categories or products. |

### B) Invariants that must hold

- **State-machine:** All DraftStore status/committedStoreId writes go through `transitionDraftStoreStatus` in `kernel/transitions/transitionService.js`. No ad-hoc `prisma.draftStore.update` for status.
- **Auditability:** AuditEvent emitted for important transitions (transition service already does this); do not remove or bypass.
- **Publish idempotent:** When draft is already `committed` and `committedStoreId` is set, `publishDraft` returns existing store; do not remove this branch.
- **Separation:** Frontscreen must read **published** representation only (Business where `isActive === true`); no draft-only dependency.
- **Auth:** `requireAuth` on publish and draft-store routes; ownership enforced; no relaxation or reorder that weakens this.
- **UX:** Clear disabled reasons for publish/preview; loading/error states; success includes “Back to My Store” where applicable.

### C) Minimal-diff approach

- **Additive only:** New storefront route; deterministic hero fallback in existing publish chain; no refactor of publish/draft pipeline.
- **No contract change** to `POST /api/store/publish` request/response.
- **Fixes only where proven broken:** Single-responsibility patches; no broad refactors.

---

## 2) PLAN (ordered tasks + files to touch)

| # | Task | Files |
|---|------|--------|
| 0 | Repo scan (spine mapped) | — |
| 1 | E2E contract & runner | Already done: `docs/E2E_STORE_CREATION_CONTRACT.md`, `scripts/e2e-french-baguette.js`, README, `pnpm run e2e:french-baguette` |
| 2 | Frontscreen API (published only) | **NEW** `routes/storefrontRoutes.js`; **EDIT** `server.js` (mount) |
| 3 | Deterministic hero fallback | **EDIT** `services/draftStore/publishDraftService.js` (fallback when hero/avatar null); **EDIT** contract doc (rule) |
| 4 | Health snapshot | Already done: `GET /api/debug/store-creation-health` in `routes/debug.js` |
| 5 | Verify auth & idempotency | No code change (already enforced) |
| 6 | Output doc + test instructions | This file |

---

## 3) IMPLEMENTATION (exact changes with file paths)

### 3.1) New: `apps/core/cardbey-core/src/routes/storefrontRoutes.js`

- **GET /frontscreen** (mounted at `/api/storefront`, so **GET /api/storefront/frontscreen**): no auth. Returns `{ ok: true, stores: [...] }` where `stores` = `Business` rows with `isActive === true`, ordered by `publishedAt` desc (or `updatedAt`), fields: `id`, `name`, `slug`, `heroImageUrl`, `avatarImageUrl`, `publishedAt`, `type`. **Published only** — no draft data.

### 3.2) Edit: `apps/core/cardbey-core/src/server.js`

- Import `storefrontRoutes` from `./routes/storefrontRoutes.js`.
- Add `app.use('/api/storefront', storefrontRoutes);` (e.g. after stores routes).

### 3.3) Edit: `apps/core/cardbey-core/src/services/draftStore/publishDraftService.js` — DONE

- **Deterministic hero/avatar fallback:** After computing `storeLogo` and `storeHeroImage`, added `firstProductImageUrl` from first item in `products` with `imageUrl` / `image.url` / `primaryImageUrl`. If `storeHeroImage` is null, set to `firstProductImageUrl`. If `resolvedAvatarUrl` is null, set to `firstProductImageUrl`. Preview and published use the same rule.

### 3.4) Edit: `docs/E2E_STORE_CREATION_CONTRACT.md`

- Add **Deterministic hero rule:** “Hero: meta.profileHeroUrl → preview.hero → preview.heroImageUrl → **first product image** → null. Avatar: same chain; if still null, **first product image**. Preview and published frontscreen use the same rule.”

---

## 4) HOW TO TEST

### Commands (local)

Run these in order. Copy one block at a time to avoid paste glitches.

**1. Start API**

```bash
cd apps/core/cardbey-core && pnpm dev
```

**2. Health-only (no auth)**

```bash
pnpm run e2e:french-baguette
```

Expect: health check passes; message that full E2E requires AUTH_TOKEN.

**3. Full smoke (Steps 1–2) with auth**

```bash
# PowerShell: get token then run
$login = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}'
$env:AUTH_TOKEN = $login.token; pnpm run e2e:french-baguette
```

Expect: job created, job completion, draft fetch.

**4. Frontscreen (published only)**

```bash
curl -s "http://localhost:3001/api/storefront/frontscreen"
```

Expect: `{ "ok": true, "stores": [ ... ] }` with only published (isActive) stores.

**5. Health snapshot**

```bash
curl -s "http://localhost:3001/api/debug/store-creation-health?limit=5"
```

**6. Step 6 binary check (dev)**

```bash
curl -s "http://localhost:3001/api/debug/verify-step6?storeId=YOUR_STORE_ID"
```

Expect: `{ "ok": true, "storeId", "smartObjectCount", "loyaltyProgramExists", "step6Pass" }`.

### Manual checklist (Steps 1–6)

- **Step 1:** Create Store (French Baguette) with real auth (Quick Create → orchestra/start).
- **Step 2:** Add coffee product; upload or use fallbacks for avatar/hero.
- **Step 3:** Preview Store — categories, hero/avatar, product cards correct.
- **Step 4:** Publish Store — click Publish; click again; confirm no duplicate store (idempotent).
- **Step 5:** Frontscreen — open app/frontscreen; confirm it shows **published** store only, correct assets (GET /api/storefront/frontscreen returns published list).
- **Step 6:** Smart Object promo via QR on cup works; loyalty program visible for store. Binary check: `GET /api/debug/verify-step6?storeId=...`

### Publish idempotency verification

1. Publish a draft (storeId + generationRunId).
2. Call **POST /api/store/publish** again with same body (or click Publish again in UI).
3. **Expected:** Second response same `publishedStoreId`, 200; no second Business row; no duplicate tasks.
4. **Implementation:** `publishDraftService.js` returns existing store when `targetDraft.status === 'committed'` and `committedStoreId` set.

---

## Touched files (this pass)

| File | Change |
|------|--------|
| `docs/E2E_STORE_CREATION_MASTER_OUTPUT.md` | Risk, plan, implementation, how to test (formatting fix + Step 6 command), touched files, open issues. |
| `apps/core/cardbey-core/src/routes/storefrontRoutes.js` | GET /frontscreen: contract-true comments (published snapshot only; hero/avatar/publishedAt from Business). |
| `apps/core/cardbey-core/src/server.js` | Import storefrontRoutes; mount `/api/storefront`. |
| `apps/core/cardbey-core/src/services/draftStore/publishDraftService.js` | Hero/avatar fallback; AuditEvent `publish_without_preview_step_recorded` when preview step not recorded. |
| `docs/E2E_STORE_CREATION_CONTRACT.md` | Step 5 contract-true; Step 2 uploads optional; Step 6 verify-step6; Preview-step guardrail; Deterministic hero rule. |
| `apps/core/cardbey-core/src/routes/debug.js` | GET /api/debug/verify-step6?storeId= (Step 6 binary check: smartObjectCount, loyaltyProgramExists, step6Pass). |
| `apps/core/cardbey-core/src/routes/stores.js` | PATCH /api/stores/:storeId/draft/hero (persist heroImageUrl/avatarImageUrl to draft); import patchDraftPreview. |

---

## 5) OPEN ISSUES / FOLLOW-UPS

- **Hero/avatar upload endpoints:** Dashboard calls `PATCH /api/stores/:id/draft/hero` and `POST /api/stores/:id/upload/hero`. If these are missing in core, add them in a follow-up (additive) so upload E2E works; until then deterministic fallback (first product image) satisfies “or deterministic fallbacks”.
- **Preview “latest draft” cache:** If Step 3 fails due to stale preview, fix with minimal cache-invalidation or no-cache for draft fetch where appropriate.
- **Smart Object / Loyalty (Step 6):** Verified manually; if broken, fix in separate minimal PR.
- **CI:** “E2E must be green” can remain a documented manual gate or be added to GitHub Actions when desired.
