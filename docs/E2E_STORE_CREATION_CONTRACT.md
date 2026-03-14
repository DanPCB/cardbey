# E2E Store Creation Contract

**Mission:** Finish the Store Creation flow end-to-end using the real workflow test case: **"French Baguette" café store → coffee product → Smart Object promo via QR on cup → loyalty program visible.**

Campaign V2 work is **PAUSED**. This contract covers only basic store creation workflow, real Auth, and bug-free store display on frontscreen.

---

## Definition of Done (E2E only)

This work is **done** when the following steps pass in sequence on the integration branch:

| Step | Description | Pass criteria |
|------|-------------|---------------|
| **1** | Create Store (French Baguette) with **real auth user** | User can create a draft store; draft has store name and at least one product (e.g. coffee). |
| **2** | Add coffee product + upload/store avatar & hero images (or deterministic fallbacks) | Product appears in draft; hero/avatar are persisted via **upload** (PATCH/POST endpoints) **or** deterministic fallback. **Uploads are optional:** if no upload is used, first-product-image fallback satisfies the step. |
| **3** | Preview Store renders correctly | Category sections correct; hero/avatars correct; product card correct. |
| **4** | Publish Store is **idempotent** | Safe to click Publish multiple times; status-driven; no duplicate Business/tasks. |
| **5** | Frontscreen shows the **published** store bug-free | **Contract-true:** Reads from published snapshot only (Business). heroImageUrl, avatarImageUrl, publishedAt are from the published entity — source of truth. No draft or computed values. |
| **6** | Smart Object promo via QR on cup works; loyalty program visible for the store | QR resolves to promo/landing; loyalty program visible for the published store. Binary check: use GET /api/debug/verify-step6?storeId= to verify. |

---

## Deterministic hero / avatar rule

- **Hero:** `meta.profileHeroUrl` → `preview.hero` → `preview.heroImageUrl` → **first product image** (first item in `preview.items` with an image URL) → null.
- **Avatar:** Same chain; if still null, **first product image** as fallback.
- Preview and published frontscreen use the same rule (publish service applies this fallback when persisting to Business).

---

## Preview-step guardrail (Workflow Steps Are Immutable)

- When the user completes the preview step (views store preview), the client SHOULD record it by sending `preview.meta.previewStepCompletedAt` (ISO timestamp) in `PATCH /api/draft-store/:draftId` with the preview payload.
- If publish is called and the draft has no `preview.meta.previewStepCompletedAt`, the backend emits an AuditEvent `publish_without_preview_step_recorded` (non-blocking). This makes the step visible for debugging and future enforcement.

---

## Invariants (must hold before and after any change)

- **State-machine centric:** All `DraftStore` status writes go through the kernel transition service (or the existing single transition boundary). No ad-hoc status writes.
- **Auditability:** Emit `AuditEvent` (or equivalent) for every important transition (draft→ready, ready→published/committed, etc.).
- **Publish idempotent:** Repeat publish must not create duplicate tasks or corrupt state. Already implemented in `publishDraftService.js`: if `status === 'committed'` and `committedStoreId` set, return existing store.
- **Separation:** Frontscreen must read from **published** representation only (no draft-only data).
- **Auth:** Draft editing and publishing must be permissioned (real auth end-to-end).
- **UX:** Clear disabled reasons for publish/preview; loading/error states; success screen includes “Back to My Store” where applicable.

---

## Constraints / Guardrails

- **Minimal diff:** Do not refactor unrelated modules. Do not rename broad APIs. Prefer additive changes.
- **No Campaign V2:** Do not start or implement Campaign V2 in this scope.
- **No large new frameworks** unless required to meet invariants.

---

## Getting AUTH_TOKEN (for E2E script)

The `AUTH_TOKEN` is the **JWT** returned by login (or register). Use it as `Authorization: Bearer <token>`.

**Option 1 – Login (existing user)**  
`POST /api/auth/login` with body `{ "email": "your@email.com", "password": "yourpassword" }`.  
Response: `{ "ok": true, "token": "<jwt>", "user": { ... } }` → use `token` as `AUTH_TOKEN`.

**Option 2 – Register (new user)**  
`POST /api/auth/register` with body `{ "email": "your@email.com", "password": "yourpassword", "fullName": "Your Name" }`.  
Response: `{ "ok": true, "token": "<jwt>", "user": { ... } }` → use `token` as `AUTH_TOKEN`.

**PowerShell (get token and run E2E):**
```powershell
$login = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"your@email.com","password":"yourpassword"}'
$env:AUTH_TOKEN = $login.token
pnpm run e2e:french-baguette
```

**curl (copy token from response):**
```bash
curl -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"your@email.com\",\"password\":\"yourpassword\"}"
```
Then set `AUTH_TOKEN=<token>` and run the script.

---

## Reference: Current Spine

1. **Create:** Quick Create (FeaturesPage) → `POST /api/mi/orchestra/start` (requireAuth) → `runBuildStoreJob` → `generateDraft` → DraftStore status `generating` → `ready`.
2. **Load draft:** Store Review (StoreReviewPage + StoreDraftReview) → `GET /api/stores/temp/draft?generationRunId=...` or `GET /api/store-draft/:id` / `GET /api/draft-store/:draftId`.
3. **Save draft:** `PATCH /api/draft-store/:draftId` with `{ preview }` (requireAuth + ownership).
4. **Publish:** `POST /api/store/publish` (requireAuth) with `{ storeId, generationRunId? }` → `publishDraft()` → `transitionDraftStoreStatus(..., 'committed')`; idempotent when already committed.
5. **Frontscreen:** `GET /api/storefront/frontscreen` (or equivalent) must return **published** stores only.
6. **Smart Object / QR:** `GET /api/smart-objects/:idOrPublicCode/landing`, `POST .../active-promo`; public QR at `/q/:publicCode`.
7. **Loyalty:** Loyalty program visible for store (routes in `loyaltyRoutes.js` / `loyaltyEngineRoutes.js`).

---

## Files to Touch (minimal)

- **Contract / runner:** This file; `scripts/e2e-french-baguette.js`; `docs/IMPACT_REPORT_E2E_STORE_CREATION.md`.
- **Health snapshot:** `routes/debug.js` or `routes/internal.js` (add store-creation health) or doc-only.
- **No mandatory change** to `draftStoreService.js`, `publishDraftService.js`, `transitionService.js`, or auth middleware unless a specific bug is identified; prefer additive fixes only.
