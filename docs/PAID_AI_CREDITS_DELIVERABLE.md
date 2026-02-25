# Paid-AI-Only Credits Policy — Deliverable

## Summary

- **Chargeable:** Only `paid_ai` (AI store generation: LLM menu + AI images). Template, manual, free_api remain **free and unlimited**.
- **Auth:** Paid AI requires an authenticated user; guest requests get `AUTH_REQUIRED_FOR_AI` (401).
- **Spend:** First full AI store can use **Welcome Bundle** (1 full store); then **user credits** (cost model: 5 credits menu + 1 per image, cap 50 images).
- **Scope:** Backend only (cardbey-core). No UI changes; GET /api/billing/balance exposed for UI.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/core/cardbey-core/prisma/schema.prisma` | User: `aiCreditsBalance` (Int default 0), `welcomeFullStoreRemaining` (Int default 1), `aiCreditsUpdatedAt` (DateTime? optional). |
| `apps/core/cardbey-core/src/services/billing/costPolicy.js` | **New.** CostSource enum, isChargeable/requiresAuth, ACTION_COST_SOURCE matrix. |
| `apps/core/cardbey-core/src/services/billing/creditsService.js` | **New.** getBalance, grantWelcomeBundleOnRegister, estimateCost, canSpend, spendCredits, consumeWelcomeBundle. |
| `apps/core/cardbey-core/src/services/billing/withPaidAiBudget.js` | **New.** Wrapper: paid_ai → auth + image cap 50 + bundle or credits; else run fn() unchanged. |
| `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` | generateDraft(draftId, options); two-modes AI path wrapped in withPaidAiBudget; template/ocr unchanged. |
| `apps/core/cardbey-core/src/services/auth/authService.js` | After user create, call grantWelcomeBundleOnRegister(user.id). |
| `apps/core/cardbey-core/src/routes/draftStore.js` | Pass userId to generateDraft; map AUTH_REQUIRED_FOR_AI → 401, INSUFFICIENT_CREDITS → 402, AI_IMAGE_CAP_EXCEEDED → 400. |
| `apps/core/cardbey-core/src/services/draftStore/orchestraBuildStore.js` | Pass task.userId to generateDraft; include err.code in failed task result. |
| `apps/core/cardbey-core/src/routes/automation.js` | Pass req.userId to generateDraft. |
| `apps/core/cardbey-core/src/routes/billing.js` | **New.** GET /api/billing/balance (requireAuth). |
| `apps/core/cardbey-core/src/server.js` | Mount billing routes at /api/billing. |

---

## Prisma Migration

- **Name:** `add_ai_credits_and_welcome_bundle`
- **Command:** `npx prisma migrate dev --name add_ai_credits_and_welcome_bundle`
- **Note:** If P3006 (e.g. duplicate column in an older migration) appears, fix existing migration history or use `npx prisma db push` to apply schema changes without creating a new migration.

---

## Example Request/Response Errors

### AUTH_REQUIRED_FOR_AI (401)

**When:** Guest (or unauthenticated) triggers draft generation with mode `ai`.

**Request:** `POST /api/draft-store/generate` with body `{ "mode": "ai", "prompt": "..." }` and no `Authorization` header.

**Response (401):**
```json
{
  "ok": false,
  "code": "AUTH_REQUIRED_FOR_AI",
  "message": "Authentication required to use paid AI"
}
```

---

### INSUFFICIENT_CREDITS (402)

**When:** Authenticated user triggers paid AI but has no welcome bundle remaining and `aiCreditsBalance` < estimated cost (e.g. 37 for full store).

**Response (402):**
```json
{
  "ok": false,
  "code": "INSUFFICIENT_CREDITS",
  "message": "Insufficient credits for this action"
}
```

---

### AI_IMAGE_CAP_EXCEEDED (400)

**When:** Paid AI request would generate more than 50 images (hard cap in withPaidAiBudget).

**Response (400):**
```json
{
  "ok": false,
  "code": "AI_IMAGE_CAP_EXCEEDED",
  "message": "AI image count exceeds maximum of 50"
}
```

---

## Free Paths (Never Charged, Never Blocked)

- **Template mode:** `mode: 'template'` → buildFromTemplate → no withPaidAiBudget, no credits.
- **Manual:** Manual upload / manual store creation → costSource manual → not chargeable.
- **Free API:** Pexels/Unsplash image fetch in menuVisualAgent → free_api; no guard applied (guard is only at draft generation entry; internal image calls are not individually wrapped).
- **OCR mode:** Uses LLM for OCR in some paths but currently two-modes pipeline uses buildFromOcr/buildCatalog; OCR is not tagged paid_ai in the single entry-point guard (only `mode === 'ai'` is wrapped). So OCR remains free.

---

## Cost Model (Current)

- **Menu/text (one unit):** 5 credits.
- **Per image:** 1 credit.
- **Standard full store (with images):** 5 + 32 = 37 credits if not using welcome bundle.
- **Image cap:** 50 max per job.

---

## Env Vars

| Variable | Purpose |
|----------|---------|
| `WELCOME_BUNDLE_FULL_STORE_COUNT` | Default 1; number of free full-store AI generations per user on register. |
| `TRIAL_AI_CREDITS` | Optional; if > 0, grant that many aiCreditsBalance on register. |

---

## GET /api/billing/balance

**Auth:** Required (Bearer).

**Response (200):**
```json
{
  "ok": true,
  "aiCreditsBalance": 0,
  "welcomeFullStoreRemaining": 1
}
```

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking template/manual/OCR flows | Only `mode === 'ai'` is gated; template/ocr paths unchanged. |
| Breaking guest draft creation | Guest can still create drafts; only **generation** for mode `ai` requires auth and returns 401 if no user. |
| Double-spend or race | Credits/bundle consumed inside withPaidAiBudget **after** fn() succeeds; transaction-safe spend/consume. |
| Legacy pipeline (USE_QUICK_START_TWO_MODES=false) | Not wrapped; remains as-is. Can add guard later if needed. |

---

## Manual QA Checklist

- [ ] Guest can use template mode (no auth) → draft created and generated.
- [ ] Guest can use manual/OCR without errors.
- [ ] Guest triggers AI mode → 401 with code `AUTH_REQUIRED_FOR_AI`.
- [ ] New user after register has `welcomeFullStoreRemaining` = 1 (and optional trial credits if env set).
- [ ] First paid_ai full store for that user consumes welcome bundle only (no credit deduction).
- [ ] Second paid_ai full store (after bundle used) uses credits; fails with `INSUFFICIENT_CREDITS` if balance < 37.
- [ ] GET /api/billing/balance returns correct balances for authenticated user.
- [ ] Template generation does not decrement bundle or credits.
